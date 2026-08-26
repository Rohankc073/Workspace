// 'use client';

// import { useState } from 'react';
// import Link from 'next/link';
// import { useRouter } from 'next/navigation';

// export default function SignupPage() {
//   const router = useRouter();
//   const [form, setForm] = useState({ name: '', email: '', password: '', companyName: '' });
//   const [busy, setBusy] = useState(false);
//   const [error, setError] = useState('');

//   function set(key) {
//     return (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
//   }

//   async function submit(e) {
//     e.preventDefault();
//     setBusy(true);
//     setError('');
//     try {
//       const res = await fetch('/api/auth/signup', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify(form),
//       });
//       if (res.ok) {
//         router.push('/');
//         router.refresh();
//       } else {
//         const d = await res.json().catch(() => ({}));
//         setError(d.error || 'Could not create your account.');
//         setBusy(false);
//       }
//     } catch {
//       setError('Could not create your account.');
//       setBusy(false);
//     }
//   }

//   return (
//     <div style={S.wrap}>
//       <div style={S.card}>
//         <div style={S.brand}>
//           <span style={S.mark}>A</span>
//           <span style={S.brandName}>Atlas</span>
//         </div>

//         <h1 style={S.title}>Create your workspace</h1>
//         <p style={S.sub}>Set up your company and become its administrator.</p>

//         <form onSubmit={submit}>
//           <label style={S.label} htmlFor="name">Your name</label>
//           <input id="name" className="field" value={form.name} onChange={set('name')} autoFocus />

//           <label style={S.label} htmlFor="email">Work email</label>
//           <input id="email" className="field" type="email" value={form.email} onChange={set('email')} />

//           <label style={S.label} htmlFor="company">Company name</label>
//           <input id="company" className="field" value={form.companyName} onChange={set('companyName')} />

//           <label style={S.label} htmlFor="password">Password</label>
//           <input
//             id="password"
//             className="field"
//             type="password"
//             value={form.password}
//             onChange={set('password')}
//             placeholder="At least 8 characters"
//           />

//           {error ? <p style={S.error}>{error}</p> : null}

//           <button
//             type="submit"
//             className="btn btn-primary"
//             disabled={busy}
//             style={S.submit}
//           >
//             {busy ? 'Creating…' : 'Create workspace'}
//           </button>
//         </form>

//         <p style={S.foot}>
//           Already have an account? <Link href="/login" style={S.link}>Sign in</Link>
//         </p>
//       </div>
//     </div>
//   );
// }

// const S = {
//   wrap: {
//     minHeight: '100vh',
//     display: 'flex',
//     alignItems: 'center',
//     justifyContent: 'center',
//     padding: 24,
//     background: 'var(--bg)',
//   },
//   card: {
//     width: '100%',
//     maxWidth: 420,
//     background: 'var(--panel)',
//     border: '1px solid var(--line)',
//     borderRadius: 16,
//     padding: 32,
//     boxShadow: '0 1px 2px rgba(17,24,39,.05)',
//   },
//   brand: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 },
//   mark: {
//     width: 34,
//     height: 34,
//     borderRadius: 9,
//     background: 'var(--accent)',
//     color: '#fff',
//     display: 'inline-flex',
//     alignItems: 'center',
//     justifyContent: 'center',
//     fontSize: 16,
//     fontWeight: 500,
//   },
//   brandName: { fontSize: 20, fontWeight: 400, color: 'var(--text-2)' },
//   title: { fontSize: 24, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--text)' },
//   sub: { fontSize: 14, color: 'var(--muted)', marginTop: 6, marginBottom: 22, lineHeight: 1.5 },
//   label: {
//     display: 'block',
//     fontSize: 13,
//     color: 'var(--muted)',
//     margin: '16px 0 6px',
//   },
//   error: {
//     fontSize: 13,
//     color: 'var(--danger)',
//     background: 'var(--danger-soft)',
//     padding: '10px 14px',
//     borderRadius: 'var(--r-card)',
//     marginTop: 16,
//   },
//   submit: { width: '100%', marginTop: 24 },
//   foot: { fontSize: 13, color: 'var(--muted)', marginTop: 20, textAlign: 'center' },
//   link: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 },
// };
