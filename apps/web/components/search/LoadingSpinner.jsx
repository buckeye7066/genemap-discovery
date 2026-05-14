// Search-specific spinner alias (the original repo had a separate
// search/LoadingSpinner.jsx that was missing). Defers to the shared
// component so we don't ship two divergent implementations.
import SharedLoadingSpinner from '@/components/LoadingSpinner';

export default function LoadingSpinner(props) {
  return <SharedLoadingSpinner {...props} />;
}
