export type Role = "owner" | "admin" | "member" | "viewer";

const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

export function hasRole(actual: Role, required: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

/** OrganizationMember.role is a free string column; unknown values fail closed. */
export function parseRole(value: string): Role {
  return value in ROLE_RANK ? (value as Role) : "viewer";
}
