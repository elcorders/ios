import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../../routes';
import { api } from '../../api';
import { resetMockAuth } from '../../api/mock/auth';
import { resetMockAdmin } from '../../api/mock/admin';

function open(path: string) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

beforeEach(() => {
  resetMockAuth();
  resetMockAdmin();
  localStorage.clear();
});

async function loaded() {
  await api.verifyEmailCode('admin@example.edu', '123456');
  open('/admin/groups');
  return screen.findByRole('group', { name: 'Students per group' });
}

describe('admin groups tab', () => {
  it('renders stats, legend and one bar row per group with scaled widths', async () => {
    const chart = await loaded();
    expect(screen.getByText('Students')).toBeInTheDocument();
    expect(screen.getByText(/^±\d+$/)).toBeInTheDocument();
    const legend = screen.getByRole('list', { name: 'Legend' });
    expect(within(legend).getByText(/Has Mac/)).toBeInTheDocument();
    expect(within(legend).getByText(/No Mac/)).toBeInTheDocument();

    const res = await api.adminListSurvey('00000000-0000-4000-8000-000000000252');
    if (!res.ok) throw new Error('survey');
    const { groups } = res.data;
    expect(groups.length).toBeGreaterThan(0);
    const max = Math.max(...groups.map((g) => g.size));
    for (const g of groups) {
      const row = within(chart).getByTestId(`row-${g.no}`);
      expect(within(row).getByText(g.name)).toBeInTheDocument();
      expect(row.querySelector('.gr-total')).toHaveTextContent(String(g.size));
      for (const [seg, v] of [['has', g.has_mac], ['no', g.no_mac]] as const) {
        const el = within(row).queryByTestId(`seg-${g.no}-${seg}`);
        if (v === 0) expect(el).toBeNull();
        else expect(el).toHaveStyle({ width: `${(v / max) * 100}%` });
      }
    }
  });

  it('shows a tooltip on focus', async () => {
    const chart = await loaded();
    const seg = within(chart).getAllByRole('img')[0]!;
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(seg);
    expect(screen.getByRole('tooltip')).toHaveTextContent(/Group \d · (Has|No) Mac: \d+ of \d+/);
    fireEvent.blur(seg);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('toggles to an accessible table', async () => {
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Show as table' }));
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Group', 'Has Mac', 'No Mac', 'Total']);
    expect(screen.queryByRole('group', { name: 'Students per group' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show as chart' }));
    expect(screen.getByRole('group', { name: 'Students per group' })).toBeInTheDocument();
  });

  it('lists cards, an unassigned card, and filters members', async () => {
    await loaded();
    const unassigned = screen.getByRole('region', { name: 'Unassigned / not answered' });
    expect(within(unassigned).getAllByRole('listitem')).toHaveLength(6);
    expect(within(unassigned).getAllByText('Not answered')).toHaveLength(6);
    expect(screen.getAllByRole('region', { name: /^Group \d$/ }).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('Search members'), { target: { value: 'student004' } });
    const cards = document.querySelector('.gr-cards') as HTMLElement;
    expect(within(cards).getAllByRole('listitem')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Search members'), { target: { value: 'zzzz-none' } });
    expect(screen.getByText('No members match.')).toBeInTheDocument();
  });
});
