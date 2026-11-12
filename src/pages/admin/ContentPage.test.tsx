import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../../routes';
import { api } from '../../api';
import { resetMockAuth } from '../../api/mock/auth';
import { resetMockAdmin } from '../../api/mock/admin';
import { resetMockContent } from '../../api/mock/content';

function open(path = '/admin/content') {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

beforeEach(async () => {
  resetMockAuth();
  resetMockAdmin();
  resetMockContent();
  localStorage.clear();
  await api.verifyEmailCode('admin@example.edu', '123456');
});

const rowOf = (title: RegExp | string) => screen.getByRole('row', { name: title });
const dialog = () => screen.getByRole('dialog');

describe('admin content tab', () => {
  it('lists tutorials and resources with statuses', async () => {
    open();
    await screen.findByText('Tutorial 1 — Demo game');
    expect(rowOf(/Tutorial 1/)).toHaveTextContent('Published');
    expect(rowOf(/Tutorial 2/)).toHaveTextContent('Scheduled');
    expect(rowOf(/Tutorial 3/)).toHaveTextContent('Draft');
    expect(await screen.findByRole('heading', { name: 'Common resources' })).toBeInTheDocument();
    expect(await screen.findByText('Lab Mac setup')).toBeInTheDocument();
    expect(rowOf(/Swift cheat sheet/)).toHaveTextContent('Draft');
  });

  it('creates a tutorial from a file, prefilling the title', async () => {
    open();
    await screen.findByText('Tutorial 1 — Demo game');
    fireEvent.click(screen.getByRole('button', { name: 'Add tutorial' }));
    const file = new File(['<html><head><title>Fresh page</title></head><body>x</body></html>'], 'f.html', { type: 'text/html' });
    fireEvent.change(within(dialog()).getByLabelText(/HTML file/), { target: { files: [file] } });
    await waitFor(() => expect(within(dialog()).getByLabelText('Title')).toHaveValue('Fresh page'));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(rowOf(/Fresh page/)).toHaveTextContent('Draft'));
  });

  it('warns when the page navigates from its script (breaks inside the srcdoc viewer)', async () => {
    open();
    await screen.findByText('Tutorial 1 — Demo game');
    fireEvent.click(screen.getByRole('button', { name: 'Add tutorial' }));
    const bad = new File(['<html><head><title>Deck</title></head><body><script>location.replace(`#slide-1`);</script></body></html>'], 'd.html', { type: 'text/html' });
    fireEvent.change(within(dialog()).getByLabelText(/HTML file/), { target: { files: [bad] } });
    expect(await within(dialog()).findByRole('note')).toHaveTextContent(/blank frame/);
    const ok = new File(['<html><head><title>Deck</title></head><body><script>location.hash = "slide-1";</script></body></html>'], 'd.html', { type: 'text/html' });
    fireEvent.change(within(dialog()).getByLabelText(/HTML file/), { target: { files: [ok] } });
    await waitFor(() => expect(within(dialog()).queryByRole('note')).toBeNull());
  });

  it('requires a file on create', async () => {
    open();
    await screen.findByText('Tutorial 1 — Demo game');
    fireEvent.click(screen.getByRole('button', { name: 'Add tutorial' }));
    fireEvent.change(within(dialog()).getByLabelText('Title'), { target: { value: 'No file' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Choose an HTML file');
  });

  it('publishes now and unpublishes', async () => {
    open();
    await screen.findByText('Tutorial 3 — Draft');
    fireEvent.click(screen.getByRole('button', { name: 'Publish now Tutorial 3 — Draft' }));
    await waitFor(() => expect(rowOf(/Tutorial 3/)).toHaveTextContent('Published'));
    fireEvent.click(screen.getByRole('button', { name: 'Unpublish Tutorial 3 — Draft' }));
    await waitFor(() => expect(rowOf(/Tutorial 3/)).toHaveTextContent('Draft'));
  });

  it('schedules in Colombo time (+05:30)', async () => {
    open();
    await screen.findByText('Tutorial 3 — Draft');
    fireEvent.click(screen.getByRole('button', { name: 'Schedule Tutorial 3 — Draft' }));
    fireEvent.change(within(dialog()).getByLabelText(/Publish at/), { target: { value: '2999-03-05T09:30' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Schedule' }));
    await waitFor(() => expect(rowOf(/Tutorial 3/)).toHaveTextContent('Scheduled'));
    const res = await api.adminListContent('tutorial', '00000000-0000-4000-8000-000000000252');
    const t3 = res.ok ? res.data.find((r) => r.id === 'content-t3') : undefined;
    expect(t3?.published_at).toBe('2999-03-05T04:00:00.000Z');
    expect(rowOf(/Tutorial 3/)).toHaveTextContent('09:30');
  });

  it('deletes after confirmation', async () => {
    open();
    await screen.findByText('Tutorial 3 — Draft');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Tutorial 3 — Draft' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('Tutorial 3 — Draft')).not.toBeInTheDocument());
  });

  it('previews in a sandboxed iframe without same-origin', async () => {
    open();
    await screen.findByText('Tutorial 1 — Demo game');
    fireEvent.click(screen.getByRole('button', { name: 'Preview Tutorial 1 — Demo game' }));
    const frame = await screen.findByTitle(/Preview of Tutorial 1/);
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
  });

  it('copies tutorials from another cohort as drafts', async () => {
    open();
    await screen.findByText('Tutorial 1 — Demo game');
    fireEvent.click(screen.getByRole('button', { name: 'Copy from another cohort' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Copy' }));
    expect(await screen.findByText('Copied 1 as drafts')).toBeInTheDocument();
    expect(screen.getAllByText('Old tutorial').length).toBe(1);
  });

  it('makes tutorials read-only for an archived cohort but keeps resources editable', async () => {
    localStorage.setItem('ios.admin.cohort', '00000000-0000-4000-8000-000000000251');
    open();
    await screen.findByText('Old tutorial');
    expect(screen.queryByRole('button', { name: 'Add tutorial' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete Old tutorial/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Preview Old tutorial/ })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Add resource' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Lab Mac setup' })).toBeInTheDocument();
  });
});
