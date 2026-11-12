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

  it('links tutorials from another cohort as drafts', async () => {
    open();
    await screen.findByText('Tutorial 1 — Demo game');
    fireEvent.click(screen.getByRole('button', { name: 'Link tutorials from another cohort' }));
    expect(within(dialog()).getByText(/not copied/)).toBeInTheDocument();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Link' }));
    expect(await screen.findByText('Linked 1 as drafts')).toBeInTheDocument();
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

  it('has a Class materials block with the on_session label', async () => {
    open();
    expect(await screen.findByRole('heading', { name: 'Class materials — 25.2' })).toBeInTheDocument();
    await screen.findByText('Week 2 slides — Layouts');
    expect(rowOf(/Week 2 slides/)).toHaveTextContent(/On session · next \d{2} [A-Z][a-z]{2} \d{2}:\d{2}/);
    expect(rowOf(/Setup guide/)).toHaveTextContent('Published');
    expect(screen.getByRole('button', { name: 'Add material' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Link tutorials from another cohort' })).toHaveLength(1);
  });

  it('adds a material as a draft and makes materials read-only when archived', async () => {
    open();
    await screen.findByText('Setup guide');
    fireEvent.click(screen.getByRole('button', { name: 'Add material' }));
    const file = new File(['<html><head><title>Fresh material</title></head><body>x</body></html>'], 'f.html', { type: 'text/html' });
    fireEvent.change(within(dialog()).getByLabelText(/HTML file/), { target: { files: [file] } });
    await waitFor(() => expect(within(dialog()).getByLabelText('Title')).toHaveValue('Fresh material'));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(rowOf(/Fresh material/)).toHaveTextContent('Draft'));
  });

  it('shows archived-cohort materials read-only', async () => {
    localStorage.setItem('ios.admin.cohort', '00000000-0000-4000-8000-000000000251');
    open();
    await screen.findByRole('heading', { name: 'Class materials — 25.1' });
    await screen.findByText('Old tutorial');
    expect(screen.queryByRole('button', { name: 'Add material' })).not.toBeInTheDocument();
    expect(screen.getByText(/materials are read-only/)).toBeInTheDocument();
  });

  describe('versions (S17)', () => {
    const html = (t: string) => new File([`<html><head><title>${t}</title></head><body>${t}</body></html>`], 'f.html', { type: 'text/html' });
    const cohort251 = '00000000-0000-4000-8000-000000000251';
    const t1Link = async (id: string) => {
      const res = await api.adminGetLibrary('lib-content-t1');
      return res.ok ? res.data.links.find((l) => l.content_id === id)?.version_no : undefined;
    };

    it('shows the version badge and the shared-link count', async () => {
      open();
      await screen.findByText('Tutorial 1 — Demo game');
      expect(rowOf(/Tutorial 1/)).toHaveTextContent('v2 · linked to 2 cohorts');
      expect(rowOf(/Tutorial 3/)).toHaveTextContent('v1');
      expect(rowOf(/Tutorial 3/)).not.toHaveTextContent('linked to');
    });

    it('says when a newer version is available', async () => {
      localStorage.setItem('ios.admin.cohort', cohort251);
      open();
      const row = await screen.findByRole('row', { name: /Tutorial 1/ });
      expect(row).toHaveTextContent('v1 · v2 available');
    });

    it('rolls a link back to an older version', async () => {
      open();
      await screen.findByText('Tutorial 1 — Demo game');
      fireEvent.click(screen.getByRole('button', { name: 'Version of Tutorial 1 — Demo game' }));
      const d = await screen.findByRole('dialog');
      await within(d).findByLabelText(/v2/);
      expect(within(d).getByLabelText(/v2/)).toBeChecked();
      expect(d).toHaveTextContent('Fixed the counter reset');
      fireEvent.click(within(d).getByLabelText(/v1/));
      fireEvent.click(within(d).getByRole('button', { name: 'Use this version' }));
      await waitFor(() => expect(rowOf(/Tutorial 1/)).toHaveTextContent('v1 · v2 available'));
      expect(await t1Link('content-t1')).toBe(1);
    });

    it('prompts after an edit made a new version: active ticked, archived unticked, only selected updated', async () => {
      open();
      await screen.findByText('Tutorial 1 — Demo game');
      fireEvent.click(screen.getByRole('button', { name: 'Edit Tutorial 1 — Demo game' }));
      fireEvent.change(within(dialog()).getByLabelText(/HTML file/), { target: { files: [html('Brand new')] } });
      await waitFor(() => expect(within(dialog()).getByText(/f\.html/)).toBeInTheDocument());
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));
      const d = await screen.findByRole('dialog', { name: 'Update other cohorts to v3?' });
      const box = within(d).getByRole('checkbox', { name: /25\.1/ });
      expect(box).not.toBeChecked();
      expect(d).toHaveTextContent('archived');
      fireEvent.click(box);
      fireEvent.click(within(d).getByRole('button', { name: 'Update selected' }));
      expect(await screen.findByText('Updated 1 cohort to v3.')).toBeInTheDocument();
      expect(await t1Link('content-t1-old')).toBe(3);
    });

    it('Not now leaves the other links alone', async () => {
      open();
      await screen.findByText('Tutorial 1 — Demo game');
      fireEvent.click(screen.getByRole('button', { name: 'Edit Tutorial 1 — Demo game' }));
      fireEvent.change(within(dialog()).getByLabelText(/HTML file/), { target: { files: [html('Another')] } });
      await waitFor(() => expect(within(dialog()).getByText(/f\.html/)).toBeInTheDocument());
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));
      const d = await screen.findByRole('dialog', { name: /Update other cohorts/ });
      fireEvent.click(within(d).getByRole('button', { name: 'Not now' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(await t1Link('content-t1-old')).toBe(1);
    });

    it('does not prompt for an unshared item', async () => {
      open();
      await screen.findByText('Tutorial 3 — Draft');
      fireEvent.click(screen.getByRole('button', { name: 'Edit Tutorial 3 — Draft' }));
      fireEvent.change(within(dialog()).getByLabelText(/HTML file/), { target: { files: [html('Solo')] } });
      await waitFor(() => expect(within(dialog()).getByText(/f\.html/)).toBeInTheDocument());
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(rowOf(/Tutorial 3/)).toHaveTextContent('v2'));
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    describe('library view', () => {
      const openLibrary = async () => {
        open();
        await screen.findByText('Tutorial 1 — Demo game');
        fireEvent.click(screen.getByRole('button', { name: 'Library' }));
        await screen.findByRole('article', { name: 'Tutorial 1 — Demo game' });
      };

      it('lists items with versions and linked cohorts, with kind tabs', async () => {
        await openLibrary();
        const card = screen.getByRole('article', { name: 'Tutorial 1 — Demo game' });
        expect(card).toHaveTextContent('v2 · Fixed the counter reset');
        expect(card).toHaveTextContent('25.1');
        expect(card).toHaveTextContent('v2 available');
        expect(card).toHaveTextContent('archived cohort');
        fireEvent.click(screen.getByRole('tab', { name: 'Class materials' }));
        await screen.findByRole('article', { name: 'Setup guide' });
        expect(screen.queryByRole('article', { name: /Tutorial 1/ })).toBeNull();
      });

      it('uploads a new version then offers every link, active ticked', async () => {
        await openLibrary();
        fireEvent.click(screen.getByRole('button', { name: 'Upload new version of Tutorial 1 — Demo game' }));
        const bad = new File(['<html><body><script>location.replace("#a")</script></body></html>'], 'x.html', { type: 'text/html' });
        fireEvent.change(within(dialog()).getByLabelText('HTML file'), { target: { files: [bad] } });
        expect(await within(dialog()).findByRole('note')).toHaveTextContent(/blank frame/);
        fireEvent.change(within(dialog()).getByLabelText('HTML file'), { target: { files: [html('Lib v3')] } });
        fireEvent.change(within(dialog()).getByLabelText(/Note/), { target: { value: 'Rewrite' } });
        await waitFor(() => expect(within(dialog()).queryByRole('note')).toBeNull());
        fireEvent.click(within(dialog()).getByRole('button', { name: 'Upload' }));
        const d = await screen.findByRole('dialog', { name: 'Update other cohorts to v3?' });
        expect(within(d).getByRole('checkbox', { name: /25\.2/ })).toBeChecked();
        expect(within(d).getByRole('checkbox', { name: /25\.1/ })).not.toBeChecked();
        fireEvent.click(within(d).getByRole('button', { name: 'Update selected' }));
        expect(await screen.findByText('Updated 1 cohort to v3.')).toBeInTheDocument();
        expect(screen.getByRole('article', { name: 'Tutorial 1 — Demo game' })).toHaveTextContent('v3 · Rewrite');
      });

      it('links an item to a cohort and deletes only unlinked items', async () => {
        await openLibrary();
        expect(screen.queryByRole('button', { name: /Delete Tutorial 1/ })).toBeNull();
        fireEvent.click(screen.getByRole('tab', { name: 'Class materials' }));
        await screen.findByRole('article', { name: 'Setup guide' });
        // Setup guide is linked to the active cohort only; archived cohorts can't be chosen.
        fireEvent.click(screen.getByRole('button', { name: 'Link Setup guide to a cohort' }));
        expect(within(dialog()).getByRole('option', { name: /25\.1.*archived/ })).toBeDisabled();
        fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));

        const added = await api.adminAddLibraryVersion('lib-content-t3', '<p>x</p>', null);
        expect(added.ok).toBe(true);
        await api.adminDeleteContent('content-t3');
        fireEvent.click(screen.getByRole('tab', { name: 'Tutorials' }));
        await screen.findByRole('article', { name: 'Tutorial 3 — Draft' });
        fireEvent.click(screen.getByRole('button', { name: 'Link Tutorial 3 — Draft to a cohort' }));
        fireEvent.click(within(dialog()).getByRole('button', { name: 'Link' }));
        expect(await screen.findByText('Linked to 25.2 as a draft.')).toBeInTheDocument();
        expect(screen.getByRole('article', { name: 'Tutorial 3 — Draft' })).toHaveTextContent('25.2');
      });

      it('deletes an unlinked library item after confirmation', async () => {
        await api.adminDeleteContent('content-t3');
        await openLibrary();
        fireEvent.click(screen.getByRole('button', { name: 'Delete Tutorial 3 — Draft from the library' }));
        fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete' }));
        await waitFor(() => expect(screen.queryByRole('article', { name: 'Tutorial 3 — Draft' })).toBeNull());
      });
    });
  });
});
