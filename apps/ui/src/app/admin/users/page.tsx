"use client";

import { useState } from "react";
import { Badge } from "@/components/common/Badge";
import { canAdmin } from "@/lib/auth";

interface UserEntry {
  id: string;
  name: string;
  role: "admin" | "operator" | "viewer";
  status: "active" | "inactive";
  lastLogin?: string;
}

const PLACEHOLDER_USERS: UserEntry[] = [
  {
    id: "1",
    name: "Admin Principal",
    role: "admin",
    status: "active",
    lastLogin: "2026-02-06T10:30:00Z",
  },
  {
    id: "2",
    name: "Operador 1",
    role: "operator",
    status: "active",
    lastLogin: "2026-02-06T09:15:00Z",
  },
  {
    id: "3",
    name: "Viewer Externo",
    role: "viewer",
    status: "active",
    lastLogin: "2026-02-05T18:00:00Z",
  },
];

function roleVariant(role: string): "success" | "warning" | "info" | "muted" {
  switch (role) {
    case "admin":
      return "success";
    case "operator":
      return "warning";
    case "viewer":
      return "info";
    default:
      return "muted";
  }
}

export default function AdminUsersPage() {
  const [users] = useState<UserEntry[]>(PLACEHOLDER_USERS);
  const isAdmin = canAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Admin / Users</h1>
        <p className="text-sm text-muted-foreground">
          Gestão de utilizadores e controlo de acesso baseado em roles (RBAC).
        </p>
      </div>

      {/* RBAC Info */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-xs font-medium uppercase text-muted-foreground mb-3">
          Roles do Sistema
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded border border-border p-3">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="success">Admin</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Acesso total. Pode alterar configurações, gerir utilizadores e executar todas as ações.
            </p>
          </div>
          <div className="rounded border border-border p-3">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="warning">Operator</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Pode ARM/DISARM, KILL, e executar ações operacionais. Não pode alterar configurações.
            </p>
          </div>
          <div className="rounded border border-border p-3">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="info">Viewer</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Acesso apenas de leitura. Pode visualizar cockpit, logs, replay e configurações.
            </p>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-medium uppercase text-muted-foreground">
            Utilizadores ({users.length})
          </h3>
          {isAdmin && (
            <button
              disabled
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground cursor-not-allowed opacity-50"
              title="Funcionalidade disponível em versão futura"
            >
              + Adicionar Utilizador
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-2 text-left font-medium">Nome</th>
                <th className="py-2 text-left font-medium">Role</th>
                <th className="py-2 text-left font-medium">Status</th>
                <th className="py-2 text-left font-medium">Último Login</th>
                {isAdmin && <th className="py-2 text-right font-medium">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-border/50 hover:bg-secondary/20"
                >
                  <td className="py-3 text-foreground font-medium">{user.name}</td>
                  <td className="py-3">
                    <Badge variant={roleVariant(user.role)}>{user.role}</Badge>
                  </td>
                  <td className="py-3">
                    <Badge
                      variant={user.status === "active" ? "success" : "muted"}
                    >
                      {user.status}
                    </Badge>
                  </td>
                  <td className="py-3 font-mono text-xs text-muted-foreground">
                    {user.lastLogin
                      ? new Date(user.lastLogin).toLocaleString("pt-PT")
                      : "—"}
                  </td>
                  {isAdmin && (
                    <td className="py-3 text-right">
                      <button
                        disabled
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Funcionalidade disponível em versão futura"
                      >
                        Editar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Placeholder notice */}
      <div className="rounded border border-border/50 bg-card/50 p-3">
        <p className="text-[10px] text-muted-foreground/60">
          Esta página é um placeholder para gestão de utilizadores RBAC. A funcionalidade completa
          (criação, edição, desativação de utilizadores e gestão de API keys) será implementada
          quando o backend disponibilizar os endpoints correspondentes.
        </p>
      </div>

      {!isAdmin && (
        <div className="rounded border border-yellow-500/30 bg-yellow-500/5 px-4 py-2 text-xs text-yellow-400">
          Apenas utilizadores com role Admin podem gerir utilizadores.
        </div>
      )}
    </div>
  );
}
