"use client";

import { useState, useTransition } from "react";
import { KeyRound, LoaderCircle, UserMinus } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { CopyLink } from "@/components/invite-form";
import { changeMemberRole, memberResetLink, removeMember, revokeInvite } from "@/lib/actions/members";
import { MEMBER_ROLES, type MemberRole } from "@/lib/project-meta";

export function MemberRow({
  projectId,
  member,
  canManage,
  isAdmin,
  isSelf,
}: {
  projectId: string;
  member: { userId: string; name: string; email: string; role: MemberRole; kind: string; isOwner: boolean };
  canManage: boolean;
  isAdmin: boolean;
  isSelf: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [link, setLink] = useState<string>();
  const [confirm, setConfirm] = useState(false);

  const run = (task: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const result = await task();
      setError(result.error);
    });

  return (
    <li className="rounded-2xl border border-white/8 bg-white/3 p-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={member.name} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {member.name} {isSelf && <span className="text-xs font-normal text-white/40">(te)</span>}
          </p>
          <p className="truncate text-xs text-white/45">
            {member.email}
            {member.isOwner && " · létrehozó"}
            {member.kind === "admin" && " · adminisztrátor"}
          </p>
        </div>
        {canManage && !member.isOwner ? (
          <select
            aria-label={`${member.name} szerepe`}
            defaultValue={member.role}
            disabled={pending}
            onChange={(event) => run(() => changeMemberRole(projectId, member.userId, event.target.value))}
            className="pg-field h-9 rounded-lg bg-transparent px-2 text-sm text-white outline-none [&>option]:bg-ink-900"
          >
            {Object.entries(MEMBER_ROLES).map(([key, { label }]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        ) : (
          <span className="rounded-full bg-white/6 px-2.5 py-1 text-xs font-semibold text-white/65">{MEMBER_ROLES[member.role].label}</span>
        )}
        {pending && <LoaderCircle size={15} aria-hidden className="animate-spin text-volt" />}
        {isAdmin && member.kind === "tag" && (
          <button
            type="button"
            title="Jelszó-visszaállító link"
            aria-label="Jelszó-visszaállító link kérése"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await memberResetLink(member.userId);
                setError(result.error);
                setLink(result.link);
              })
            }
            className="grid size-9 place-items-center rounded-lg text-white/50 transition hover:bg-white/8 hover:text-white"
          >
            <KeyRound size={16} aria-hidden />
          </button>
        )}
        {((canManage && !member.isOwner) || (isSelf && !member.isOwner)) &&
          (confirm ? (
            <span className="flex items-center gap-1.5 text-xs">
              <button type="button" onClick={() => run(() => removeMember(projectId, member.userId))} className="rounded-lg bg-red-500/20 px-2.5 py-1.5 font-semibold text-red-100">
                {isSelf ? "Kilépek" : "Eltávolít"}
              </button>
              <button type="button" onClick={() => setConfirm(false)} className="px-1.5 text-white/55">
                Mégsem
              </button>
            </span>
          ) : (
            <button
              type="button"
              title={isSelf ? "Kilépés a projektből" : "Eltávolítás a projektből"}
              aria-label={isSelf ? "Kilépés a projektből" : "Eltávolítás a projektből"}
              onClick={() => setConfirm(true)}
              className="grid size-9 place-items-center rounded-lg text-white/50 transition hover:bg-red-500/15 hover:text-red-200"
            >
              <UserMinus size={16} aria-hidden />
            </button>
          ))}
      </div>
      {link && (
        <p className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-volt/8 px-3 py-2 text-xs text-white/70">
          24 órán át érvényes, egyszer használható link. Küldd el neki: <CopyLink link={link} />
        </p>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
    </li>
  );
}

export function RevokeInviteButton({ inviteId, projectId }: { inviteId: string; projectId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => void (await revokeInvite(inviteId, projectId)))}
      className="text-xs font-semibold text-red-200 hover:underline disabled:opacity-50"
    >
      Visszavonás
    </button>
  );
}
