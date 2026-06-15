export interface ImportPreviewRow {
  [key: string]: string;
}

export interface ImportPreview {
  format: 'csv' | 'json';
  headers: string[];
  rows: ImportPreviewRow[];
  rowCount: number;
  errors: string[];
}

const PREVIEW_LIMIT = 5;

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCSVPreview(content: string): ImportPreview {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length === 0 || !lines[0].trim()) {
    return { format: 'csv', headers: [], rows: [], rowCount: 0, errors: ['File is empty'] };
  }

  const headers = parseCSVLine(lines[0]);
  if (headers.length === 0) {
    return { format: 'csv', headers: [], rows: [], rowCount: 0, errors: ['No columns found in header row'] };
  }

  const errors: string[] = [];
  const rows: ImportPreviewRow[] = [];
  const dataLines = lines.slice(1).filter(l => l.trim());

  for (let i = 0; i < Math.min(dataLines.length, PREVIEW_LIMIT); i++) {
    const values = parseCSVLine(dataLines[i]);
    if (values.length !== headers.length) {
      errors.push(`Row ${i + 2}: expected ${headers.length} columns, got ${values.length}`);
      continue;
    }
    const row: ImportPreviewRow = {};
    headers.forEach((h, j) => { row[h] = values[j]; });
    rows.push(row);
  }

  return { format: 'csv', headers, rows, rowCount: dataLines.length, errors };
}

export function parseJSONPreview(content: string): ImportPreview {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (e) {
    return {
      format: 'json', headers: [], rows: [], rowCount: 0,
      errors: [`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  if (!Array.isArray(data)) {
    return { format: 'json', headers: [], rows: [], rowCount: 0, errors: ['JSON root must be an array of objects'] };
  }
  if (data.length === 0) {
    return { format: 'json', headers: [], rows: [], rowCount: 0, errors: ['JSON array is empty'] };
  }

  const first = data[0];
  if (typeof first !== 'object' || first === null) {
    return { format: 'json', headers: [], rows: [], rowCount: 0, errors: ['Array elements must be objects'] };
  }

  const headers = Object.keys(first);
  const rows = (data as Record<string, unknown>[])
    .slice(0, PREVIEW_LIMIT)
    .map(item => {
      const row: ImportPreviewRow = {};
      headers.forEach(h => { row[h] = item[h] == null ? '' : String(item[h]); });
      return row;
    });

  return { format: 'json', headers, rows, rowCount: data.length, errors: [] };
}

export function detectFormat(filename: string): 'csv' | 'json' | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'csv') return 'csv';
  if (ext === 'json') return 'json';
  return null;
}

export function previewImport(filename: string, content: string): ImportPreview {
  const format = detectFormat(filename);
  if (format === 'json') return parseJSONPreview(content);
  if (format === 'csv') return parseCSVPreview(content);
  return {
    format: 'csv', headers: [], rows: [], rowCount: 0,
    errors: ['Unsupported file format. Use .csv or .json'],
  };
}
