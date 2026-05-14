// Renders "Explain with AI / Ask follow-up" buttons inline next to a
// visualization. Original component missing from the repo. The LLM call
// must always be authenticated and rate-limited (enforced server-side in
// services/api/src/routes/llm.js); this component just routes the user to
// the AI Assistants page rather than calling the LLM directly, so we
// cannot accidentally bypass the server-side guards.
import { useNavigate } from 'react-router-dom';

export default function AskAIButtons({ context, label = 'Explain with AI' }) {
  const navigate = useNavigate();
  const handleClick = () => {
    const q = encodeURIComponent(context ? `Explain: ${context}` : 'Explain this');
    navigate(`/aiassistants?prompt=${q}`);
  };
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center px-3 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100"
      >
        {label}
      </button>
    </div>
  );
}
