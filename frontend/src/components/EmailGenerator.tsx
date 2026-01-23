// frontend/src/components/EmailGenerator.tsx
import {useState} from 'react';
import {useAuth} from '@/context/AuthContext';

const DOMAIN = '@extramus.eu';
const departments = [
  'Digital Marketing',
  'Human Resource Management',
  'Business & Data Analyst',
  'Project Management',
  'Languages',
  'IT',
  'Urban Design',
  'Law',
];
const departmentPositions: Record<string, string[]> = {
  'Digital Marketing': [
    'Social Media Manager',
    'Video Editor',
    'Copywriter',
    'Plot Writer',
    'Google Ads Manager',
    'Lead Generation',
    'Graphic Designer',
    'Community Manager',
  ],
  'Human Resource Management': [
    'Recruitment',
    'Executive Assistant',
    'HR Intern',
  ],
  'Business & Data Analyst': [
    'Google Analytics',
    'Accountant',
    'Business Analyst',
    'Finance',
  ],
  'Project Management': [
    'European Project Manager',
    'Business Project Manager',
    'Product Manager',
  ],
  Languages: ['English', 'Italian', 'Spanish'],
  IT: [
    'WordPress Developer',
    'Front-End Developer',
    'Back-End Developer',
    'Cyber Security',
    'Game Developer',
    'Full Stack Developer',
    'UX/UI Designer',
    'App Developer',
    'Web Developer',
    'Chatbot Manager',
  ],
  'Urban Design': ['Civil Engineer', 'Architect'],
  Law: ['Business Lawyer'],
};

export default function EmailGenerator() {
  const {token} = useAuth();
  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [dept, setDept] = useState('');
  const [position, setPosition] = useState('');
  const [joiningDate, setJoiningDate] = useState('');
  const [leavingDate, setLeavingDate] = useState('');
  const [email, setEmail] = useState('');
  const [empID, setEmpID] = useState('');
  const [msg, setMsg] = useState('');

  function generate() {
    if (!firstName || !surname || !dept || !position || !joiningDate) {
      return setMsg('Please fill all required fields.');
    }
    const rand = Math.floor(10000 + Math.random() * 90000).toString();
    const prefix = `${firstName.toLowerCase()}.${surname[0].toLowerCase()}${rand}`;
    setEmail(prefix + DOMAIN);
    setEmpID(rand);
    setMsg('');
  }

  async function submitRequest() {
    setMsg('');
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          firstName,
          surname,
          department: dept,
          position,
          joiningDate,
          leavingDate: leavingDate || undefined,
          email,
          empID,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMsg('Request submitted!');
      // clear form
      setFirstName('');
      setSurname('');
      setDept('');
      setPosition('');
      setJoiningDate('');
      setLeavingDate('');
      setEmail('');
      setEmpID('');
    } catch (e: any) {
      setMsg('Error: ' + e.message);
    }
  }

  return (
    <div style={{maxWidth: 500, margin: 'auto', padding: 16}}>
      <h2>Email & Request Generator</h2>
      <div style={{display: 'grid', gap: 8}}>
        <input
          placeholder="First Name"
          value={firstName}
          onChange={e => setFirstName(e.target.value)}
        />
        <input
          placeholder="Surname"
          value={surname}
          onChange={e => setSurname(e.target.value)}
        />
        <select
          value={dept}
          onChange={e => {
            setDept(e.target.value);
            setPosition('');
          }}
        >
          <option value="">-- Select Department --</option>
          {departments.map(d => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          value={position}
          onChange={e => setPosition(e.target.value)}
          disabled={!dept}
        >
          <option value="">-- Select Position --</option>
          {dept &&
            departmentPositions[dept].map(p => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
        </select>
        <label>
          Joining Date{' '}
          <input
            type="date"
            value={joiningDate}
            onChange={e => setJoiningDate(e.target.value)}
          />
        </label>
        <label>
          Leaving Date{' '}
          <input
            type="date"
            value={leavingDate}
            onChange={e => setLeavingDate(e.target.value)}
          />
        </label>

        <button onClick={generate}>Generate Email & EmpID</button>

        {email && (
          <div style={{background: '#f0f0f0', padding: 8}}>
            <div>
              <strong>Email:</strong> {email}
            </div>
            <div>
              <strong>EmpID:</strong> {empID}
            </div>
          </div>
        )}

        <button onClick={submitRequest} disabled={!email}>
          Submit Request
        </button>

        {msg && <p>{msg}</p>}
      </div>
    </div>
  );
}
