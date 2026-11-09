import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Plus } from 'lucide-react';

interface Company { id: string; code: string; legalName: string; displayName: string; gstin: string | null; active: boolean }
interface Branch { id: string; companyId: string; code: string; name: string; city: string | null; state: string | null }
interface Site { id: string; companyId: string; code: string; name: string; city: string | null; state: string | null }
interface Dept { id: string; name: string }

export default function Organisation({ sitesOnly = false }: { sitesOnly?: boolean }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({ code: '', displayName: '', legalName: '', gstin: '' });

  const companies = useQuery({ queryKey: ['companies'], queryFn: () => api.get<Company[]>('/organisation/companies') });
  const branches = useQuery({ queryKey: ['branches'], queryFn: () => api.get<Branch[]>('/organisation/branches') });
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api.get<Site[]>('/organisation/sites') });
  const depts = useQuery({ queryKey: ['departments'], queryFn: () => api.get<Dept[]>('/organisation/departments') });

  const createCompany = useMutation({
    mutationFn: () => api.post('/organisation/companies', {
      code: form.code, displayName: form.displayName,
      legalName: form.legalName || form.displayName,
      gstin: form.gstin || undefined,
    }),
    onSuccess: () => {
      setForm({ code: '', displayName: '', legalName: '', gstin: '' });
      qc.invalidateQueries({ queryKey: ['companies'] });
    },
  });

  if (sitesOnly) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-semibold text-navy-800">Sites</h1>
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="bg-navy-50/60">
              <tr><th className="th">Code</th><th className="th">Site</th><th className="th">City</th><th className="th">State</th></tr>
            </thead>
            <tbody className="divide-y divide-navy-50">
              {sites.data?.map((s) => (
                <tr key={s.id}>
                  <td className="td font-mono text-xs">{s.code}</td>
                  <td className="td font-medium">{s.name}</td>
                  <td className="td">{s.city ?? '—'}</td>
                  <td className="td">{s.state ?? '—'}</td>
                </tr>
              ))}
              {sites.data && !sites.data.length && <tr><td className="td text-navy-400" colSpan={4}>No sites yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-navy-800">Organisation</h1>
        <p className="text-sm text-navy-500 mt-1">Companies, branches, sites and departments in this tenant</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ['Companies', companies.data?.length ?? 0],
          ['Branches', branches.data?.length ?? 0],
          ['Sites', sites.data?.length ?? 0],
        ].map(([label, value]) => (
          <div key={label as string} className="card p-5">
            <div className="text-xs uppercase tracking-wide text-navy-400">{label}</div>
            <div className="mt-2 text-2xl font-semibold text-navy-800">{value}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="px-5 py-4 border-b border-navy-100"><h2 className="font-semibold text-navy-800">Companies</h2></div>
        <table className="w-full">
          <thead className="bg-navy-50/60">
            <tr><th className="th">Code</th><th className="th">Display name</th><th className="th">Legal name</th><th className="th">GSTIN</th></tr>
          </thead>
          <tbody className="divide-y divide-navy-50">
            {companies.data?.map((c) => (
              <tr key={c.id}>
                <td className="td font-mono text-xs">{c.code}</td>
                <td className="td font-medium">{c.displayName}</td>
                <td className="td">{c.legalName}</td>
                <td className="td">{c.gstin ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {can('org:write') && (
        <div className="card p-5">
          <h2 className="font-semibold text-navy-800 mb-4">Add a company</h2>
          <form className="grid gap-4 sm:grid-cols-2"
                onSubmit={(e) => { e.preventDefault(); createCompany.mutate(); }}>
            <div><label className="label">Code *</label>
              <input required className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div><label className="label">Display name *</label>
              <input required className="input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></div>
            <div><label className="label">Legal name</label>
              <input className="input" value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} /></div>
            <div><label className="label">GSTIN</label>
              <input className="input" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} /></div>
            <div className="sm:col-span-2">
              <button className="btn-primary" disabled={createCompany.isPending}>
                <Plus size={16} /> {createCompany.isPending ? 'Saving…' : 'Add company'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <div className="px-5 py-4 border-b border-navy-100"><h2 className="font-semibold text-navy-800">Departments</h2></div>
        <div className="p-5 flex flex-wrap gap-2">
          {depts.data?.map((d) => (
            <span key={d.id} className="badge bg-navy-100 text-navy-600">{d.name}</span>
          ))}
          {!depts.data?.length && <span className="text-sm text-navy-400">No departments.</span>}
        </div>
      </div>
    </div>
  );
}
