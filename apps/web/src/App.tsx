import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import Shell from './components/Shell';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import LeadDetail from './pages/LeadDetail';
import Surveys from './pages/Surveys';
import Quotations from './pages/Quotations';
import QuotationNew from './pages/QuotationNew';
import Organisation from './pages/Organisation';
import Users from './pages/Users';
import Tenders from './pages/Tenders';
import TenderDetail from './pages/TenderDetail';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import Contracts from './pages/Contracts';
import ClientCare from './pages/ClientCare';
import Employees from './pages/Employees';
import EmployeeDetail from './pages/EmployeeDetail';
import Workforce from './pages/Workforce';
import Statutory from './pages/Statutory';
import Attendance from './pages/Attendance';
import Payroll from './pages/Payroll';
import PayrollRunDetail from './pages/PayrollRunDetail';
import Finance from './pages/Finance';
import InvoiceForm from './pages/InvoiceForm';
import InvoiceDetail from './pages/InvoiceDetail';
import Assets from './pages/Assets';
import Stock from './pages/Stock';
import PurchaseOrders from './pages/PurchaseOrders';
import Marketing from './pages/Marketing';
import Reports from './pages/Reports';
import AiAssistant from './pages/AiAssistant';
import CreativeStudio from './pages/CreativeStudio';
import Platform from './pages/Platform';

function Protected({ children }: { children: JSX.Element }) {
  const { me, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="text-sm text-navy-500">Loading workspace…</div>
      </div>
    );
  }
  if (!me) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Shell /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="leads" element={<Leads />} />
        <Route path="leads/:id" element={<LeadDetail />} />
        <Route path="surveys" element={<Surveys />} />
        <Route path="quotations" element={<Quotations />} />
        <Route path="quotations/new" element={<QuotationNew />} />
        <Route path="organisation" element={<Organisation />} />
        <Route path="users" element={<Users />} />
        <Route path="tenders" element={<Tenders />} />
        <Route path="tenders/:id" element={<TenderDetail />} />
        <Route path="clients" element={<Clients />} />
        <Route path="clients/:id" element={<ClientDetail />} />
        <Route path="contracts" element={<Contracts />} />
        <Route path="client-care" element={<ClientCare />} />
        <Route path="employees" element={<Employees />} />
        <Route path="employees/:id" element={<EmployeeDetail />} />
        <Route path="workforce" element={<Workforce />} />
        <Route path="statutory" element={<Statutory />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="payroll" element={<Payroll />} />
        <Route path="payroll/runs/:id" element={<PayrollRunDetail />} />
        <Route path="sites" element={<Organisation sitesOnly />} />
        <Route path="finance" element={<Finance />} />
        <Route path="finance/invoices/new" element={<InvoiceForm />} />
        <Route path="finance/invoices/:id" element={<InvoiceDetail />} />
        <Route path="assets" element={<Assets />} />
        <Route path="stock" element={<Stock />} />
        <Route path="purchase-orders" element={<PurchaseOrders />} />
        <Route path="marketing" element={<Marketing />} />
        <Route path="reports" element={<Reports />} />
        <Route path="ai" element={<AiAssistant />} />
        <Route path="creative" element={<CreativeStudio />} />
        <Route path="platform" element={<Platform />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
