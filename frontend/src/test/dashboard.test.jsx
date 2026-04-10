import { render, screen } from '@testing-library/react'

jest.mock('../api', () => ({
  authedFetch: jest.fn((path) => {
    if (typeof path === 'string' && path.startsWith('/config/guardrails')) {
      return Promise.resolve({
        rules: [{ enabled: true, condition: 'BLOCKED', action: 'BLOCK', message: '' }],
        block_on_status: ['BLOCKED'],
      })
    }
    return Promise.resolve({ agents: { mine: true, bank: true } })
  }),
  API_BASE_URL: '',
  connectHitlSocket: jest.fn(() => ({ close: () => {} })),
  exportAuditReportPdf: jest.fn(),
}))

import Dashboard from '../pages/Dashboard'

test('shows monitoring cards', () => {
  render(<Dashboard stats={{ total_runs: 4, blocked: 1, approved: 2, alerts: 1 }} />)
  expect(screen.getByText('Agents Executed')).toBeInTheDocument()
  expect(screen.getByText('Blocked')).toBeInTheDocument()
  expect(screen.getByText('Approved')).toBeInTheDocument()
  expect(screen.getByText('Alerts')).toBeInTheDocument()
})
