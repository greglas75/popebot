export default function ForbiddenPage() {
  return (
    <div style={{
      fontFamily: 'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      textAlign: 'center',
      padding: '1rem',
    }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          403 — Access Denied
        </h1>
        <p style={{ color: '#666', marginBottom: '1.5rem' }}>
          You don't have permission to view this page.
        </p>
        <a
          href="/"
          style={{
            color: 'inherit',
            textDecoration: 'underline',
            textUnderlineOffset: '4px',
          }}
        >
          Go home
        </a>
      </div>
    </div>
  );
}
