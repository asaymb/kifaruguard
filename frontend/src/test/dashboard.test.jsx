import { render, screen } from '@testing-library/react'
import Dashboard from '../pages/Dashboard'

test('shows monitoring cards', () => {
  render(<Dashboard stats={{ total_runs: 4, blocked: 1, approved: 2, alerts: 1 }} />)
  expect(screen.getByText('Agents Executed')).toBeInTheDocument()
  expect(screen.getByText('Blocked')).toBeInTheDocument()
  expect(screen.getByText('Approved')).toBeInTheDocument()
  expect(screen.getByText('Alerts')).toBeInTheDocument()
})
