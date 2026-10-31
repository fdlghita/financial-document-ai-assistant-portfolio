import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the document AI dashboard', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /financial document ai assistant/i })).toBeInTheDocument();
});
