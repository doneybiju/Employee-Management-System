import React from 'react';

export default function LoginButton() {
  return (
    <a
      href="http://localhost:4000/api/auth/google"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0.75rem 1.5rem',
        backgroundColor: '#ffffff',
        color: '#333333',
        border: '1px solid #d1d5db',
        borderRadius: '0.375rem',
        fontWeight: 500,
        textDecoration: 'none',
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        cursor: 'pointer',
        marginTop: '1rem',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <img
        src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
        alt="Google logo"
        style={{ width: '1.25rem', height: '1.25rem', marginRight: '0.75rem' }}
      />
      Login with Google
    </a>
  );
}
