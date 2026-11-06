import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

export function Home() {
  const { me, signOut } = useAuth();
  const navigate = useNavigate();
  if (!me) return null;
  const name = `${me.profile.first_name} ${me.profile.last_name}`.trim();
  return (
    <section>
      <h1>Home</h1>
      <p>
        Signed in as <strong>{name}</strong> ({me.profile.email})
      </p>
      <button
        type="button"
        onClick={async () => {
          await signOut();
          navigate('/login', { replace: true });
        }}
      >
        Sign out
      </button>
    </section>
  );
}
