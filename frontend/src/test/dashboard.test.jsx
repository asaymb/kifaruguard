import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

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
  getComplianceExportCount: jest.fn(() => 0),
  connectHitlSocket: jest.fn(() => ({ close: () => {} })),
  exportAuditReportPdf: jest.fn(),
}))

import Dashboard from '../pages/Dashboard'

test('shows overview stat cards', () => {
  render(
    <BrowserRouter>
      <Dashboard stats={{ total_runs: 4, blocked: 1, approved: 2, alerts: 1 }} token="t" pendingHitl={3} />
    </BrowserRouter>,
  )
  expect(screen.getByText('Total runs')).toBeInTheDocument()
  expect(screen.getByText('Failed / blocked')).toBeInTheDocument()
  expect(screen.getByText('Pending HITL')).toBeInTheDocument()
  expect(screen.getByText('Reports exported')).toBeInTheDocument()
  expect(screen.getByText('4')).toBeInTheDocument()
  expect(screen.getByText('3')).toBeInTheDocument()
})
