"""Writes the document fixtures used by documents-extract.test.ts and documents.test.ts.
Standard library only. Run: python3 -I server/src/__tests__/fixtures/documents/make-fixtures.py
"""
import os
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
FIXED = (2026, 1, 1, 0, 0, 0)


def write_zip(name, parts):
    with zipfile.ZipFile(os.path.join(HERE, name), 'w', zipfile.ZIP_DEFLATED) as z:
        for part, body in parts:
            info = zipfile.ZipInfo(part, FIXED)
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, body)


XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

# --- two-sheets.xlsx -------------------------------------------------------
xlsx_parts = [
    ('[Content_Types].xml', XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
     '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
     '<Default Extension="xml" ContentType="application/xml"/>'
     '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
     '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
     '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
     '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
     '</Types>'),
    ('_rels/.rels', XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
     '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
     '</Relationships>'),
    ('xl/workbook.xml', XML + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
     'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
     '<sheet name="Income" sheetId="1" r:id="rId1"/><sheet name="Notes" sheetId="2" r:id="rId2"/>'
     '</sheets></workbook>'),
    ('xl/_rels/workbook.xml.rels', XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
     '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
     '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'
     '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
     '</Relationships>'),
    ('xl/sharedStrings.xml', XML + '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="5" uniqueCount="5">'
     '<si><t>Account</t></si><si><t>Amount</t></si><si><t>Sales</t></si>'
     '<si><t>Owner email</t></si><si><t>owner@example.com</t></si></sst>'),
    ('xl/worksheets/sheet1.xml', XML + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
     '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>'
     '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>1234.5</v></c></row>'
     '</sheetData></worksheet>'),
    ('xl/worksheets/sheet2.xml', XML + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
     '<row r="1"><c r="A1" t="s"><v>3</v></c><c r="B1" t="s"><v>4</v></c></row>'
     '</sheetData></worksheet>'),
]
write_zip('two-sheets.xlsx', xlsx_parts)

# --- sample.docx -----------------------------------------------------------
docx_parts = [
    ('[Content_Types].xml', XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
     '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
     '<Default Extension="xml" ContentType="application/xml"/>'
     '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
     '</Types>'),
    ('_rels/.rels', XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
     '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
     '</Relationships>'),
    ('word/document.xml', XML + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
     '<w:p><w:r><w:t>Engagement letter for Acme Pty Ltd</w:t></w:r></w:p>'
     '</w:body></w:document>'),
]
write_zip('sample.docx', docx_parts)

# --- sample.pdf ------------------------------------------------------------
stream = b'BT /F1 24 Tf 72 700 Td (Invoice total 980.00) Tj ET'
objs = [
    b'<< /Type /Catalog /Pages 2 0 R >>',
    b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    b'<< /Length ' + str(len(stream)).encode() + b' >>\nstream\n' + stream + b'\nendstream',
    b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
]
out = bytearray(b'%PDF-1.4\n')
offsets = []
for i, body in enumerate(objs, start=1):
    offsets.append(len(out))
    out += str(i).encode() + b' 0 obj\n' + body + b'\nendobj\n'
xref = len(out)
out += b'xref\n0 ' + str(len(objs) + 1).encode() + b'\n'
out += b'0000000000 65535 f \n'
for off in offsets:
    out += ('%010d 00000 n \n' % off).encode()
out += b'trailer\n<< /Size ' + str(len(objs) + 1).encode() + b' /Root 1 0 R >>\nstartxref\n' + str(xref).encode() + b'\n%%EOF\n'
with open(os.path.join(HERE, 'sample.pdf'), 'wb') as f:
    f.write(out)

# --- csv and txt -----------------------------------------------------------
with open(os.path.join(HERE, 'sample.csv'), 'w', newline='') as f:
    f.write('Account,Amount\nSales,1234.50\n')
with open(os.path.join(HERE, 'sample.txt'), 'w', newline='') as f:
    f.write('Notes for the client.\n')
