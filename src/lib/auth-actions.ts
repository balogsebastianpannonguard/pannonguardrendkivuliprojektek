"use server";

import { createHash, randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { redirect } from "next/navigation";
import { recordAudit } from "@/lib/audit";
import { addEvent, checkInvitationToken, checkResetToken, markLogin, redeemInvitation, redeemResetToken, undoRedeem, getAccessState } from "@/lib/invitations";
import { ADMIN_URL, PORTAL_URL, adminAllowed, isPortal, mayEnter } from "@/lib/mode";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { addMember, checkInvite, redeemInvite } from "@/lib/project-invites";
import { logActivity } from "@/lib/projects";
import { createSession, destroyAllSessions, destroySession, getSession, requireUser } from "@/lib/session";
import { clearAttempts, registerAttempt } from "@/lib/throttle";
import { findUserByEmail, findUserById, users } from "@/lib/users";

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "");
const validName = (name: string) => name.length >= 4 && name.length <= 80 && name.includes(" ");
const NAME_ERROR = "Add meg a teljes neved (vezeték- és keresztnév).";

/* ---------- Regisztráció az Elosztó meghívójával (projektadminisztrátor) ---------- */

export type RegisterState = { error?: string; name?: string };

export async function register(_previous: RegisterState, formData: FormData): Promise<RegisterState> {
  const token = field(formData, "token");
  const name = field(formData, "name").trim().replace(/\s+/g, " ");
  const password = field(formData, "password");
  const confirm = field(formData, "confirm");

  try {
    if (isPortal) return { error: "Itt nem lehet adminisztrátori fiókot nyitni.", name };
    const invitation = await checkInvitationToken(token);
    if (invitation.status !== "valid") return { error: "Ez a meghívó már nem érvényes. Kérj újat az adminisztrátortól.", name };
    if (!validName(name)) return { error: NAME_ERROR, name };
    const problem = passwordProblem(password, invitation.email);
    if (problem) return { error: problem, name };
    if (password !== confirm) return { error: "A két jelszó nem egyezik.", name };

    const passwordHash = await hashPassword(password);
    const redeemed = await redeemInvitation(token, name);
    if (!redeemed) return { error: "Ez a meghívó közben érvénytelenné vált.", name };

    let userId: ObjectId;
    try {
      const inserted = await (await users()).insertOne({
        _id: new ObjectId(),
        email: redeemed.email.toLowerCase(),
        name,
        // Az adminok a megadott címek; mindenki más az Elosztóból meghívott felhasználó, aki csak a saját projektjeit látja.
        kind: adminAllowed(redeemed.email) ? "admin" : "tag",
        passwordHash,
        invitationId: redeemed._id,
        invitedBy: redeemed.invitedBy,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      });
      userId = inserted.insertedId;
    } catch (error) {
      const duplicate = (error as { code?: number }).code === 11000;
      const reclaimed = duplicate
        ? await reclaimOrphanedAdmin(redeemed.email, redeemed._id, redeemed.invitedBy, name, passwordHash)
        : null;
      if (!reclaimed) {
        await undoRedeem(redeemed._id);
        return { error: duplicate ? "Ezzel az e-mail-címmel már van fiók. Lépj be inkább." : "A regisztráció átmenetileg nem érhető el.", name };
      }
      userId = reclaimed;
    }

    await Promise.all([markLogin(redeemed._id), recordAudit("register", redeemed.email, userId)]);
    await recordAudit("login.success", redeemed.email, userId);
    await createSession(userId);
  } catch (error) {
    console.error("Regisztrációs hiba:", (error as Error).name);
    return { error: "A regisztráció átmenetileg nem érhető el.", name };
  }
  redirect("/?udv=1");
}

/**
 * Ha a címhez régebbi adminfiók tartozik, amelynek a meghívóját az Elosztóban törölték (vagy vissza van vonva),
 * az új, érvényes meghívó beváltása újraindítja a fiókot: új jelszó, tiszta munkamenetek.
 * Csak Elosztóból létrehozott fiókot vesz át (projektmeghívóval jött tagot nem), élő hozzáférésűt sem.
 */
async function reclaimOrphanedAdmin(email: string, invitationId: ObjectId, invitedBy: string, name: string, passwordHash: string) {
  const existing = await findUserByEmail(email);
  if (!existing || !existing.invitationId || existing.invitationId.equals(invitationId)) return null;
  if (!(await getAccessState(existing.invitationId)).revoked) return null;

  const updated = await (await users()).findOneAndUpdate(
    { _id: existing._id, invitationId: existing.invitationId },
    { $set: { name, passwordHash, invitationId, invitedBy, kind: adminAllowed(existing.email) ? "admin" : "tag", createdAt: new Date(), lastLoginAt: new Date() }, $unset: { disabledAt: "" } },
  );
  if (!updated) return null;
  await destroyAllSessions(existing._id);
  await clearAttempts(`login:${existing.email}`);
  return existing._id;
}

/* ---------- Csatlakozás projektmeghívóval (közreműködő) ---------- */

export async function joinWithInvite(_previous: RegisterState, formData: FormData): Promise<RegisterState> {
  const token = field(formData, "token");
  const name = field(formData, "name").trim().replace(/\s+/g, " ");
  const password = field(formData, "password");
  const confirm = field(formData, "confirm");
  let projectId: ObjectId;

  try {
    if (!isPortal) return { error: "A meghívót a munkatársi portálon kell megnyitni.", name };
    const check = await checkInvite(token);
    if (check.status !== "valid") return { error: "Ez a meghívó már nem érvényes. Kérj újat attól, aki meghívott.", name };
    if (await findUserByEmail(check.invite.email)) return { error: "Ezzel az e-mail-címmel már van fiókod. Lépj be, és fogadd el a meghívót.", name };
    if (!validName(name)) return { error: NAME_ERROR, name };
    const problem = passwordProblem(password, check.invite.email);
    if (problem) return { error: problem, name };
    if (password !== confirm) return { error: "A két jelszó nem egyezik.", name };

    const passwordHash = await hashPassword(password);
    const redeemed = await redeemInvite(check.invite._id);
    if (!redeemed) return { error: "Ez a meghívó közben érvénytelenné vált.", name };

    const inviter = await findUserById(check.invite.invitedBy);
    let userId: ObjectId;
    try {
      const inserted = await (await users()).insertOne({
        _id: new ObjectId(),
        email: check.invite.email,
        name,
        kind: "tag",
        passwordHash,
        invitedBy: inviter?.name ?? "projektvezető",
        createdAt: new Date(),
        lastLoginAt: new Date(),
      });
      userId = inserted.insertedId;
    } catch (error) {
      // A meghívó újra használható, ha a fiók létrehozása nem sikerült.
      await (await (await import("@/lib/projects")).invitesCol()).updateOne({ _id: check.invite._id }, { $unset: { acceptedAt: "" } });
      const duplicate = (error as { code?: number }).code === 11000;
      return { error: duplicate ? "Ezzel az e-mail-címmel már van fiók. Lépj be inkább." : "A csatlakozás átmenetileg nem érhető el.", name };
    }

    await addMember(check.invite.projectId, userId, check.invite.role, check.invite.invitedBy);
    await logActivity(check.invite.projectId, userId, `${name} csatlakozott a projekthez`);
    await recordAudit("member.join", check.invite.email, userId);
    await recordAudit("login.success", check.invite.email, userId);
    await createSession(userId);
    projectId = check.invite.projectId;
  } catch (error) {
    console.error("Csatlakozási hiba:", (error as Error).name);
    return { error: "A csatlakozás átmenetileg nem érhető el.", name };
  }
  redirect(`/projektek/${projectId}?udv=1`);
}

/** Belépett felhasználó elfogad egy rá szóló, még nyitott meghívót. */
export async function acceptInvite(inviteId: string): Promise<{ error?: string; projectId?: string }> {
  const user = await requireUser();
  if (!/^[0-9a-f]{24}$/i.test(inviteId)) return { error: "A meghívó nem található." };
  const { invitesCol } = await import("@/lib/projects");
  const invite = await (await invitesCol()).findOne({ _id: new ObjectId(inviteId) });
  if (!invite || invite.email !== user.email.toLowerCase()) return { error: "A meghívó nem található." };
  const redeemed = await redeemInvite(invite._id);
  if (!redeemed) return { error: "Ez a meghívó már nem érvényes." };
  await addMember(invite.projectId, user.oid, invite.role, invite.invitedBy);
  await logActivity(invite.projectId, user.oid, `${user.name} elfogadta a meghívást`);
  return { projectId: String(invite.projectId) };
}

/* ---------- Belépés ---------- */

export type LoginState = { error?: string; email?: string };

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = field(formData, "email").trim().toLowerCase().slice(0, 254);
  const password = field(formData, "password");
  const next = field(formData, "next");

  try {
    if (!(await registerAttempt(`login:${email}`))) {
      await recordAudit("login.locked", email);
      return { email, error: "Túl sok próbálkozás. Próbáld újra 15 perc múlva." };
    }
    const user = await findUserByEmail(email);
    const passwordOk = await verifyPassword(password, user?.passwordHash);
    if (!user || !passwordOk) {
      await recordAudit("login.failure", email, user?._id);
      return { email, error: "Hibás e-mail-cím vagy jelszó." };
    }
    if (user.disabledAt) return { email, error: "A hozzáférésedet letiltották. Fordulj a projektvezetőhöz." };
    if (isPortal && user.kind !== "tag") {
      return { email, error: `Ez a belépés a meghívott munkatársaknak szól.${ADMIN_URL ? " Az adminisztrátori felület címe másik." : ""}` };
    }
    if (!isPortal && !mayEnter(user)) {
      return { email, error: `Ez a felület nem a munkatársaké. A saját belépőoldalad a meghívó levélben kapott portál${PORTAL_URL ? `: ${PORTAL_URL}` : ""}.` };
    }
    if (user.invitationId) {
      if ((await getAccessState(user.invitationId)).revoked) return { email, error: "A hozzáférésedet visszavonták." };
      await markLogin(user.invitationId);
    }
    await clearAttempts(`login:${email}`);
    await (await users()).updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
    await recordAudit("login.success", user.email, user._id);
    await createSession(user._id);
  } catch (error) {
    console.error("Belépési hiba:", (error as Error).name);
    return { email, error: "A belépés átmenetileg nem érhető el." };
  }
  // Csak belső útvonalra irányítunk vissza.
  redirect(/^\/(?!\/)[\w\-./?=&%]{0,200}$/.test(next) ? next : "/");
}

/* ---------- Kijelentkezés ---------- */

export async function logout() {
  const session = await getSession();
  if (session) {
    const user = await findUserById(session.userId);
    if (user) await recordAudit("logout", user.email, user._id);
  }
  await destroySession();
  redirect("/login?ok=kilepve");
}

export async function logoutEverywhere() {
  const user = await requireUser();
  await recordAudit("logout.all", user.email, user.oid);
  await destroyAllSessions(user.oid);
  await destroySession();
  redirect("/login?ok=mindenhol");
}

/* ---------- Jelszó-visszaállítás ---------- */

export type ResetState = { error?: string };

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Helyi (tag) jelszó-visszaállító link kiállítása a felhasználónak; a nyers tokent egyszer adja vissza. */
export async function issueLocalReset(userId: ObjectId) {
  const token = randomBytes(32).toString("base64url");
  await (await users()).updateOne({ _id: userId }, { $set: { resetTokenHash: hashToken(token), resetExpiresAt: new Date(Date.now() + 24 * 3_600_000) } });
  return token;
}

export type LocalResetCheck = { status: "valid"; email: string } | { status: "invalid" | "expired" };

export async function checkLocalReset(token: string): Promise<LocalResetCheck> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return { status: "invalid" };
  const user = await (await users()).findOne({ resetTokenHash: hashToken(token) });
  if (!user) return { status: "invalid" };
  if (!user.resetExpiresAt || user.resetExpiresAt.getTime() <= Date.now()) return { status: "expired" };
  return { status: "valid", email: user.email };
}

export async function resetPassword(_previous: ResetState, formData: FormData): Promise<ResetState> {
  const token = field(formData, "token");
  const password = field(formData, "password");
  const confirm = field(formData, "confirm");

  try {
    const local = await checkLocalReset(token);
    if (local.status === "valid") {
      const problem = passwordProblem(password, local.email);
      if (problem) return { error: problem };
      if (password !== confirm) return { error: "A két jelszó nem egyezik." };
      const passwordHash = await hashPassword(password);
      const user = await (await users()).findOneAndUpdate(
        { resetTokenHash: hashToken(token), resetExpiresAt: { $gt: new Date() } },
        { $set: { passwordHash }, $unset: { resetTokenHash: "", resetExpiresAt: "" } },
        { returnDocument: "after" },
      );
      if (!user) return { error: "Ez a link közben érvénytelenné vált. Kérj újat." };
      await destroyAllSessions(user._id);
      await clearAttempts(`login:${user.email}`);
      await recordAudit("password.reset", user.email, user._id);
      redirect("/login?ok=jelszocsere");
    }

    // Az Elosztóból kapott link (projektadminisztrátor).
    const check = await checkResetToken(token);
    if (check.status !== "valid") return { error: "Ez a link már nem érvényes. Kérj újat." };
    const problem = passwordProblem(password, check.email);
    if (problem) return { error: problem };
    if (password !== confirm) return { error: "A két jelszó nem egyezik." };

    const passwordHash = await hashPassword(password);
    const redeemed = await redeemResetToken(token);
    if (!redeemed) return { error: "Ez a link közben érvénytelenné vált. Kérj újat." };
    const user = await findUserByEmail(redeemed.email);
    if (!user) return { error: "A fiók nem található. Fordulj az adminisztrátorhoz." };

    await (await users()).updateOne({ _id: user._id }, { $set: { passwordHash } });
    await destroyAllSessions(user._id);
    await clearAttempts(`login:${user.email}`);
    await Promise.all([recordAudit("password.reset", user.email, user._id), addEvent(redeemed._id, "password.changed", "felhasználó")]);
  } catch (error) {
    // A redirect() is kivételt dob; azt tovább kell engedni.
    if ((error as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw error;
    console.error("Jelszó-visszaállítási hiba:", (error as Error).name);
    return { error: "A művelet átmenetileg nem érhető el." };
  }
  redirect("/login?ok=jelszocsere");
}
