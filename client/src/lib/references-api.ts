export interface NavigatePaper {
  id: number;
  arxiv_id: string;
  title: string;
  authors: string;
  published: string;
  categories: string;
  status: string;
  summary: string;
}

export interface ScribeAttachment {
  id: string;
  subject: string;
  filename: string;
  type: string;
  size: number;
  createdAt: string;
}

export async function fetchPapers(): Promise<{ papers: NavigatePaper[]; error?: string }> {
  try {
    const res = await fetch('/api/references/papers');
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { papers: [], error: data.error || `Failed: ${res.status}` };
    }
    const papers = await res.json();
    return { papers: Array.isArray(papers) ? papers : [] };
  } catch {
    return { papers: [], error: 'Failed to fetch papers' };
  }
}

export async function fetchAttachments(): Promise<{ attachments: ScribeAttachment[]; error?: string }> {
  try {
    const res = await fetch('/api/references/attachments');
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { attachments: [], error: data.error || `Failed: ${res.status}` };
    }
    const attachments = await res.json();
    return { attachments: Array.isArray(attachments) ? attachments : [] };
  } catch {
    return { attachments: [], error: 'Failed to fetch attachments' };
  }
}

export async function exportReferences(
  paperIds: number[],
  attachmentIds: string[]
): Promise<{ success: boolean; filename: string; count: number; error?: string }> {
  try {
    const res = await fetch('/api/references/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paperIds, attachmentIds }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, filename: '', count: 0, error: data.error || `Failed: ${res.status}` };
    }
    return data;
  } catch {
    return { success: false, filename: '', count: 0, error: 'Export request failed' };
  }
}
