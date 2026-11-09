import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

interface UserRow {
  id: string; email: string; name: string; active: boolean;
  roles: string[]; roleNames: string[]; lastLoginAt: string | null;
}

export default function Users() {
  const { me } = useAuth();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get<UserRow[]>('/users') });
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api.get<any[]>('/users/roles') });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-navy-800">Users &amp; roles</h1>
        <p className="text-sm text-navy-500 mt-1">{users.data?.length ?? 0} users in this tenant</p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="bg-navy-50/60">
            <tr><th className="th">Name</th><th className="th">Email</th><th className="th">Roles</th>
                <th className="th">Status</th><th className="th">Last sign-in</th></tr>
          </thead>
          <tbody className="divide-y divide-navy-50">
            {users.data?.map((u) => (
              <tr key={u.id}>
                <td className="td font-medium">{u.name}</td>
                <td className="td">{u.email}</td>
                <td className="td">
                  <div className="flex flex-wrap gap-1">
                    {u.roleNames.map((r) => (
                      <span key={r} className="badge bg-brand-50 text-brand-700">{r}</span>
                    ))}
                  </div>
                </td>
                <td className="td">
                  <span className={`badge ${u.active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                    {u.active ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td className="td text-navy-400">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('en-IN') : 'Never'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="px-5 py-4 border-b border-navy-100">
          <h2 className="font-semibold text-navy-800">Roles available in this tenant</h2>
        </div>
        <div className="p-5 grid gap-3 sm:grid-cols-2">
          {roles.data?.map((r) => (
            <div key={r.id} className="rounded-lg border border-navy-100 p-4">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-navy-800">{r.name}</span>
                <span className="badge bg-navy-100 text-navy-500">{r.code}</span>
              </div>
              <p className="mt-1 text-xs text-navy-500">{r.description}</p>
              <p className="mt-2 text-xs text-navy-400">
                {r.rolePermissions?.length ?? 0} permissions
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
