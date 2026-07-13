"use client";

import { useState } from "react";
import { TeamCard, type TeamMember } from "@/components/settings/team-card";

export function EquipeView({
  userId,
  orgId,
  isOwner,
  initialMembers,
}: {
  userId: string;
  orgId: string;
  isOwner: boolean;
  initialMembers: TeamMember[];
}) {
  const [members, setMembers] = useState(initialMembers);

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
      <TeamCard
        userId={userId}
        orgId={orgId}
        isOwner={isOwner}
        members={members}
        setMembers={setMembers}
      />
    </div>
  );
}
