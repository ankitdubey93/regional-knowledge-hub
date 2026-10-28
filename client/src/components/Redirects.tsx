import { Navigate, useLocation, useParams } from 'react-router-dom';

/** Old learning URLs (/learn, /compare, /tools, /practice and below) moved under /knowledge. */
export function HubRedirect() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={`/knowledge${pathname}${search}${hash}`} replace />;
}

/** /clients/:id became the entity dashboard. */
export function ClientRedirect() {
  const { id = '' } = useParams();
  return <Navigate to={`/entities/${id}`} replace />;
}
