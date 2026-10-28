import { useAuth } from "@/auth/AuthProvider";

export function useReaderShellKind(): "institution" | "individual" {
  const { profile } = useAuth();
  return profile?.role === "institution" ? "institution" : "individual";
}
