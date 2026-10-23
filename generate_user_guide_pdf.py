import os
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    """Canvas dua-lintasan untuk menampilkan total halaman 'Halaman X dari Y'"""
    def __init__(self, *args, **kwargs):
        super(NumberedCanvas, self).__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super(NumberedCanvas, self).showPage()
        super(NumberedCanvas, self).save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#718096"))
        
        # Header (mulai halaman 2)
        if self._pageNumber > 1:
            self.drawString(40, letter[1] - 30, "Panduan Pengguna — FreeUp Calc (Chrome Extension)")
            self.setStrokeColor(colors.HexColor("#CBD5E0"))
            self.setLineWidth(0.5)
            self.line(40, letter[1] - 34, letter[0] - 40, letter[1] - 34)

        # Footer
        footer_text = f"Halaman {self._pageNumber} dari {page_count}"
        self.drawRightString(letter[0] - 40, 24, footer_text)
        self.drawString(40, 24, "FreeUp Calc v1.0.0 — Upwork & Freelancer Fee Calculator")
        self.setStrokeColor(colors.HexColor("#CBD5E0"))
        self.setLineWidth(0.5)
        self.line(40, 34, letter[0] - 40, 34)
        
        self.restoreState()


def create_user_guide_pdf(filename):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=46,
        bottomMargin=46
    )

    styles = getSampleStyleSheet()

    # Color Palette
    PRIMARY = colors.HexColor("#0F4C81")    # Deep Teal/Navy
    SECONDARY = colors.HexColor("#008080")  # Teal Accent
    DARK_TEXT = colors.HexColor("#2D3748")  # Charcoal
    LIGHT_BG = colors.HexColor("#F0F4F8")   # Soft Tint
    CALLOUT_BG = colors.HexColor("#EBF3FA") # Light Blue Tint
    BORDER_COLOR = colors.HexColor("#CBD5E0")

    # Typography Styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=PRIMARY,
        spaceAfter=4
    )

    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=SECONDARY,
        spaceAfter=10
    )

    h1_style = ParagraphStyle(
        'H1',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=16,
        textColor=PRIMARY,
        spaceBefore=12,
        spaceAfter=5,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'H2',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10.5,
        leading=14,
        textColor=SECONDARY,
        spaceBefore=8,
        spaceAfter=3,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=DARK_TEXT,
        spaceAfter=4
    )

    bullet_style = ParagraphStyle(
        'Bullet',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12.5,
        textColor=DARK_TEXT,
        leftIndent=12,
        firstLineIndent=-8,
        spaceAfter=3
    )

    meta_label = ParagraphStyle(
        'MetaLabel',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=PRIMARY
    )

    meta_val = ParagraphStyle(
        'MetaVal',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11,
        textColor=DARK_TEXT
    )

    tbl_hdr = ParagraphStyle(
        'TableHdr',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=colors.white,
        alignment=1
    )

    tbl_cell = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=11,
        textColor=DARK_TEXT
    )

    tbl_cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=11,
        textColor=PRIMARY
    )

    tbl_cell_right = ParagraphStyle(
        'TableCellRight',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=11,
        textColor=DARK_TEXT,
        alignment=2
    )

    tbl_cell_right_bold = ParagraphStyle(
        'TableCellRightBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=11,
        textColor=PRIMARY,
        alignment=2
    )

    callout_txt = ParagraphStyle(
        'CalloutText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12,
        textColor=DARK_TEXT
    )

    story = []

    # Title & Subtitle
    story.append(Paragraph("PANDUAN PENGGUNA (USER GUIDE)", title_style))
    story.append(Paragraph("Ekstensi Google Chrome: FreeUp Calc (Upwork & Freelancer Fee Calculator)", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=PRIMARY, spaceBefore=0, spaceAfter=8))

    # Metadata Card Box
    meta_content = [
        [
            Paragraph("Nama Ekstensi:", meta_label),
            Paragraph("FreeUp Calc (Upwork Calc)", meta_val),
            Paragraph("Target Platform:", meta_label),
            Paragraph("Upwork & Freelancer.com", meta_val),
        ],
        [
            Paragraph("Versi / Arsitektur:", meta_label),
            Paragraph("v1.0.0 (Manifest V3)", meta_val),
            Paragraph("Fokus Utama:", meta_label),
            Paragraph("Kalkulasi Fee Transparan, Connects, FX & Take-Home IDR", meta_val),
        ]
    ]
    meta_table = Table(meta_content, colWidths=[100, 160, 95, 177])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), LIGHT_BG),
        ('BOX', (0,0), (-1,-1), 0.8, colors.HexColor("#B0C4DE")),
        ('INNERGRID', (0,0), (-1,-1), 0.3, colors.HexColor("#D8E2EC")),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 8))

    # Helper function for Callouts
    def make_callout(bold_label, text):
        c_data = [[
            Paragraph(f"<b>[{bold_label}]</b> {text}", callout_txt)
        ]]
        c_tbl = Table(c_data, colWidths=[532])
        c_tbl.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), CALLOUT_BG),
            ('BOX', (0,0), (-1,-1), 0.8, PRIMARY),
            ('TOPPADDING', (0,0), (-1,-1), 5),
            ('BOTTOMPADDING', (0,0), (-1,-1), 5),
            ('LEFTPADDING', (0,0), (-1,-1), 8),
            ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ]))
        return c_tbl

    # Section 1: Pendahuluan
    story.append(Paragraph("1. Pendahuluan & Gambaran Umum", h1_style))
    story.append(Paragraph(
        "<b>FreeUp Calc</b> adalah ekstensi browser Google Chrome yang dirancang untuk membantu para pekerja lepas (freelancer) "
        "di platform <b>Upwork</b> dan <b>Freelancer.com</b> mengetahui estimasi penghasilan bersih (<i>take-home pay</i>) riil yang akan "
        "diterima di rekening bank lokal setelah dipotong seluruh rantai biaya.",
        body_style
    ))
    story.append(Paragraph("Komponen pemotongan yang dihitung secara otomatis meliputi:", body_style))
    
    intro_points = [
        "<b>Platform Service Fee:</b> Potongan komisi platform (Upwork 10% atau Freelancer.com 10% min. $5).",
        "<b>Biaya Connects (Connect Cost):</b> Biaya pengeluaran connects untuk melamar (default $0.15/connect).",
        "<b>Pajak VAT / GST:</b> Pajak pertambahan nilai pada service fee jika belum mendaftarkan Tax ID.",
        "<b>Biaya Penarikan (Withdrawal Fee):</b> Biaya transfer flat sesuai metode (Local Bank $0.99, PayPal $2, Wire $50).",
        "<b>Provider Fee:</b> Potongan gateway pembayaran (misal persentase PayPal ~2.9% atau Payoneer ~0.5%).",
        "<b>Selisih Kurs (FX Spread Margin):</b> Estimasi spread selisih kurs penukaran valas dari USD ke Rupiah."
    ]
    for pt in intro_points:
        story.append(Paragraph(f"• {pt}", bullet_style))

    story.append(Spacer(1, 4))

    # Section 2: Persyaratan Sistem
    story.append(Paragraph("2. Persyaratan Sistem", h1_style))
    req_points = [
        "<b>Browser:</b> Google Chrome versi 88 ke atas (atau browser berbasis Chromium seperti Edge, Brave, Opera).",
        "<b>Mode Instalasi:</b> Unpacked Extension melalui Developer Mode (Mode Pengembang Chrome).",
        "<b>Koneksi Internet:</b> Diperlukan saat mengklik tombol pembaruan kurs valas otomatis dari API Bank Indonesia."
    ]
    for rp in req_points:
        story.append(Paragraph(f"• {rp}", bullet_style))

    story.append(Spacer(1, 4))

    # Section 3: Langkah Step-by-Step Instalasi
    story.append(Paragraph("3. Panduan Langkah Step-by-Step Instalasi di Google Chrome", h1_style))
    story.append(Paragraph("Ikuti 5 langkah praktis berikut untuk memasang ekstensi FreeUp Calc ke dalam browser Chrome Anda:", body_style))

    steps_data = [
        ("Langkah 1: Siapkan Folder Ekstensi di Komputer",
         "Pastikan seluruh berkas ekstensi telah berada dalam folder tetap (misalnya <code>d:\\Aplikasi DIY\\Upwork Calc</code>). Di dalam folder ini terdapat file <code>manifest.json</code>, <code>popup.html</code>, <code>calculator.js</code>, <code>content.js</code>, dan folder <code>icons/</code>.<br/><i>Catatan: Jangan memindahkan atau menghapus folder ini setelah diinstal.</i>"),
        
        ("Langkah 2: Buka Halaman Kelola Ekstensi Chrome",
         "Buka Google Chrome, lalu akses halaman kelola ekstensi dengan salah satu cara berikut:<br/>"
         "• Ketik <b>chrome://extensions</b> pada kolom alamat (URL bar) lalu tekan <b>Enter</b>.<br/>"
         "• Atau klik menu titik tiga di pojok kanan atas > pilih <b>Extensions (Ekstensi)</b> > klik <b>Manage Extensions (Kelola Ekstensi)</b>."),
        
        ("Langkah 3: Aktifkan 'Developer mode' (Mode Pengembang)",
         "Di pojok kanan atas halaman ekstensi, temukan sakelar toggle <b>Developer mode</b>.<br/>"
         "Geser toggle tersebut ke posisi <b>AKTIF (ON)</b> hingga berwarna biru. Tiga tombol baru akan muncul: <i>'Load unpacked'</i>, <i>'Pack extension'</i>, dan <i>'Update'</i>."),
        
        ("Langkah 4: Klik 'Load unpacked' dan Pilih Folder Ekstensi",
         "1. Klik tombol <b>Load unpacked</b> (Muat yang belum dibongkar) di pojok kiri atas.<br/>"
         "2. Pada jendela File Explorer yang muncul, navigasikan ke folder direktori ekstensi Anda (<code>d:\\Aplikasi DIY\\Upwork Calc</code>).<br/>"
         "3. Klik tombol <b>Select Folder</b> (Pilih Folder)."),
        
        ("Langkah 5: Verifikasi & Sematkan Ikon (Pin to Toolbar)",
         "Ekstensi 'FreeUp Calc' akan langsung terdaftar dan aktif. Untuk akses cepat:<br/>"
         "1. Klik ikon <b>Puzzle (Extensions)</b> di toolbar sebelah kanan URL bar Chrome.<br/>"
         "2. Cari <b>FreeUp Calc</b>, lalu klik ikon <b>Pin (Sematkan)</b> hingga berwarna biru.<br/>"
         "3. Ikon FreeUp Calc ($) kini akan selalu terlihat di toolbar atas browser.")
    ]

    for st_title, st_desc in steps_data:
        story.append(Paragraph(st_title, h2_style))
        story.append(Paragraph(st_desc, body_style))

    story.append(Spacer(1, 4))
    story.append(make_callout("TIPS RELOAD", "Jika Anda melakukan pembaruan kode file di masa mendatang, cukup buka halaman <code>chrome://extensions</code> lalu klik tombol putar/refresh (Reload) pada kartu FreeUp Calc."))

    story.append(PageBreak())

    # Section 4: Panduan Fitur & Penggunaan
    story.append(Paragraph("4. Panduan Fitur & Cara Penggunaan", h1_style))
    
    story.append(Paragraph("A. Fitur Deteksi Otomatis (Auto-Detect) di Upwork", h2_style))
    story.append(Paragraph(
        "FreeUp Calc dilengkapi skrip pendeteksi (<i>content script</i>) cerdas yang dapat membaca data pekerjaan langsung dari halaman Upwork:<br/>"
        "1. Buka tab lowongan pekerjaan atau halaman pengajuan proposal di <b>Upwork</b> (<code>upwork.com</code>).<br/>"
        "2. Klik ikon <b>FreeUp Calc</b> pada toolbar Chrome.<br/>"
        "3. Klik tombol <b>Deteksi</b> (ikon Kaca Pembesar di header popup).<br/>"
        "4. Nilai anggaran (budget/bid) serta jumlah <b>connects</b> yang dibutuhkan akan terisi secara otomatis ke dalam formulir.",
        body_style
    ))

    story.append(Paragraph("B. Perhitungan Manual (Fixed-Price & Hourly Rate)", h2_style))
    story.append(Paragraph(
        "Anda dapat melakukan simulasi mandiri untuk berbagai jenis proyek:<br/>"
        "• <b>Pilih Platform:</b> Pilih antara Upwork atau Freelancer.com.<br/>"
        "• <b>Tipe Proyek Fixed-Price:</b> Masukkan nominal total bid tawaran dalam USD (contoh: $500 atau $1,000).<br/>"
        "• <b>Tipe Proyek Hourly:</b> Masukkan tarif per jam (Hourly Rate) dan estimasi jam kerja. Total nilai dihitung otomatis.<br/>"
        "• <b>Connects Terpakai:</b> Masukkan jumlah connects yang dikeluarkan untuk melamar pekerjaan tersebut.<br/>"
        "• <b>Metode Withdrawal:</b> Pilih saluran penarikan dana yang Anda gunakan.",
        body_style
    ))

    story.append(Paragraph("C. Rincian Pemotongan Biaya & Hasil Bersih", h2_style))
    story.append(Paragraph("Tabel berikut menjelaskan arti setiap baris pemotongan pada kartu ringkasan kalkulator:", body_style))

    fee_expl_data = [
        [Paragraph("Komponen Biaya", tbl_hdr), Paragraph("Deskripsi & Cara Perhitungan", tbl_hdr)],
        [Paragraph("Service Fee", tbl_cell_bold), Paragraph("Komisi platform (Upwork default 10%; Freelancer 10% dengan batas minimal $5).", tbl_cell)],
        [Paragraph("VAT / GST", tbl_cell_bold), Paragraph("Pajak pertambahan nilai atas service fee platform (0% jika Tax ID valid).", tbl_cell)],
        [Paragraph("Connect Cost", tbl_cell_bold), Paragraph("Biaya modal connects yang hangus (Jumlah Connects × $0.15).", tbl_cell)],
        [Paragraph("Withdrawal Fee", tbl_cell_bold), Paragraph("Biaya flat transfer penarikan platform (misal $0.99 untuk transfer ke bank lokal).", tbl_cell)],
        [Paragraph("Provider Fee", tbl_cell_bold), Paragraph("Biaya persentase pemrosesan oleh payment provider (misal PayPal ~2.9%).", tbl_cell)],
        [Paragraph("FX Conversion", tbl_cell_bold), Paragraph("Selisih spread kurs pertukaran mata uang jika menarik via e-wallet.", tbl_cell)],
        [Paragraph("Penghasilan Bersih", tbl_cell_bold), Paragraph("Nominal akhir yang benar-benar masuk ke kantong Anda (dalam USD dan IDR) serta rasio % take-home.", tbl_cell)]
    ]
    t_fee_expl = Table(fee_expl_data, colWidths=[120, 412])
    t_fee_expl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), PRIMARY),
        ('ALIGN', (0,0), (-1,0), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('INNERGRID', (0,0), (-1,-1), 0.3, colors.HexColor("#D8E2EC")),
        ('BOX', (0,0), (-1,-1), 0.8, PRIMARY),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
        ('BACKGROUND', (0,1), (-1,1), LIGHT_BG),
        ('BACKGROUND', (0,3), (-1,3), LIGHT_BG),
        ('BACKGROUND', (0,5), (-1,5), LIGHT_BG),
        ('BACKGROUND', (0,7), (-1,7), colors.HexColor("#E2F0D9")),
    ]))
    story.append(t_fee_expl)
    story.append(Spacer(1, 8))

    story.append(Paragraph("D. Badge Scam Detector (Upwork & Freelancer.com)", h2_style))
    story.append(Paragraph(
        "Pada halaman listing proyek, FreeUp Calc memberi badge Aman, Perlu Cek, atau Berisiko. Badge ini adalah indikator awal dari data yang terlihat di halaman, bukan jaminan proyek aman atau bukti bahwa proyek adalah scam. Arahkan kursor ke badge untuk melihat alasan risiko dan checklist kriteria aman.",
        body_style
    ))
    story.append(Paragraph(
        "Kriteria Aman harus terpenuhi seluruhnya: Freelancer.com memerlukan Payment verified, Email verified, dan Deposit made (dana di-escrow). Upwork memerlukan Payment verified, hire rate di atas 90%, terakhir dilihat kurang dari 2 hari, dan nomor telepon verified. Data yang tidak terbaca dianggap belum memenuhi kriteria. Jika semua terpenuhi dan tidak ada sinyal scam kritis, badge Aman.",
        body_style
    ))
    story.append(Paragraph(
        "Jika semua kriteria Aman belum terpenuhi, badge Berisiko muncul bila ada sinyal kritis atau total skor risiko lebih dari 3. Sinyal kritis meliputi permintaan kontak di luar platform dan tawaran bayaran tinggi untuk pekerjaan yang tampak mudah. Jika tidak ada kondisi tersebut, badge Perlu Cek. Skor adalah penjumlahan poin temuan: misalnya payment belum diverifikasi (+3), deposit belum dibuat (+4), kontak di luar platform (+3), budget sangat kecil (+2), serta sejumlah sinyal lain bernilai +1 hingga +2. Badge juga menampilkan level poin: L1 Rendah (0), L2 Sedang (1–2), L3 Tinggi (3), L4 Sangat tinggi (>3), atau L5 Kritis bila ada sinyal kritis. Kategori badge dan level poin adalah informasi terpisah; hover untuk melihat rinciannya.",
        body_style
    ))
    story.append(Paragraph(
        "Pemeriksaan budget saat ini hanya menambah 2 poin bila budget yang terbaca positif dan di bawah $5, kecuali proyek ditandai sebagai microtask. Detector tidak mengukur kompleksitas, jam kerja, atau kewajaran harga berdasarkan ruang lingkup. Karena itu alasan budget adalah sinyal kasar untuk ditinjau, bukan estimasi harga proyek.",
        body_style
    ))
    story.append(Paragraph(
        "Untuk Freelancer, ikon ⛔ menandai proyek yang hanya terbuka untuk freelancer terpilih; pengguna yang tidak dipilih tidak dapat mengajukan penawaran. Peringatan ini adalah syarat kelayakan, bukan skor scam, dan dapat muncul pada badge listing maupun detail proyek.",
        body_style
    ))
    story.append(Spacer(1, 8))

    # Section 5: Halaman Pengaturan (Options Page)
    story.append(Paragraph("5. Halaman Pengaturan (Options Page)", h1_style))
    story.append(Paragraph(
        "Halaman opsi memungkinkan Anda menyesuaikan parameter perhitungan agar persis sesuai profil akun Anda. "
        "Akses halaman ini dengan mengklik tombol <b>'Pengaturan Fee →'</b> di popup kalkulator atau klik kanan ikon ekstensi > <b>Opsi</b>.",
        body_style
    ))

    opt_items = [
        "<b>Multi-Platform Support:</b> Mengatur preferensi terpisah untuk Upwork maupun Freelancer.com.",
        "<b>Service Fee Rate (%):</b> Mengubah tarif komisi default (misal 10%, atau tarif kontrak khusus).",
        "<b>Harga Connect ($):</b> Menentukan biaya per connect (standar Upwork $0.15).",
        "<b>VAT / GST Rate (%):</b> Mengatur tarif pajak pertambahan nilai negara Anda.",
        "<b>Mata Uang Tujuan (Target Currency):</b> Menentukan kode mata uang lokal (default <b>IDR</b> untuk Rupiah Indonesia).",
        "<b>Kurs Valas & Update Otomatis:</b> Tersedia tombol <i>'Update Otomatis'</i> untuk mengambil nilai kurs USD-ke-IDR terbaru dari API Bank Indonesia, atau Anda dapat mengetik kurs manual (misal 16200).",
        "<b>Kustomisasi Fee Metode Withdrawal:</b> Mengubah flat fee, provider rate %, dan FX margin % pada setiap opsi (ACH, Local Bank, Wire, PayPal, Payoneer, Wise ACH, Wise SWIFT).",
        "<b>Tombol Reset ke Default:</b> Mengembalikan semua angka ke pengaturan bawaan pabrik dengan satu klik."
    ]
    for oi in opt_items:
        story.append(Paragraph(f"• {oi}", bullet_style))

    story.append(Spacer(1, 6))

    # Section 6: Studi Kasus & Simulasi Nyata
    story.append(Paragraph("6. Studi Kasus & Simulasi Perhitungan Riil", h1_style))
    story.append(Paragraph(
        "Berikut perbandingan riil penerimaan bersih untuk proyek Fixed-Price senilai <b>$1,000</b> di Upwork "
        "(membutuhkan 8 connects = $1.20, dengan asumsi kurs USD/IDR = Rp16.000):",
        body_style
    ))

    sim_pdf_data = [
        [
            Paragraph("Rincian Komponen", tbl_hdr),
            Paragraph("Direct to Local Bank", tbl_hdr),
            Paragraph("PayPal (Withdraw)", tbl_hdr),
            Paragraph("Wise (ACH US Domestic)", tbl_hdr)
        ],
        [
            Paragraph("Nilai Proyek (Bid)", tbl_cell_bold),
            Paragraph("$1,000.00", tbl_cell_right),
            Paragraph("$1,000.00", tbl_cell_right),
            Paragraph("$1,000.00", tbl_cell_right),
        ],
        [
            Paragraph("Upwork Fee (10%)", tbl_cell),
            Paragraph("- $100.00", tbl_cell_right),
            Paragraph("- $100.00", tbl_cell_right),
            Paragraph("- $100.00", tbl_cell_right),
        ],
        [
            Paragraph("Connect Cost (8 Connects)", tbl_cell),
            Paragraph("- $1.20", tbl_cell_right),
            Paragraph("- $1.20", tbl_cell_right),
            Paragraph("- $1.20", tbl_cell_right),
        ],
        [
            Paragraph("Withdrawal Fee Platform", tbl_cell),
            Paragraph("- $0.99 (Flat)", tbl_cell_right),
            Paragraph("- $2.00 (Flat)", tbl_cell_right),
            Paragraph("- $0.00 (Gratis)", tbl_cell_right),
        ],
        [
            Paragraph("Provider Fee & FX Cost", tbl_cell),
            Paragraph("- $0.00", tbl_cell_right),
            Paragraph("- $47.38 (Fee+Margin)", tbl_cell_right),
            Paragraph("- $3.59 (0.4% FX)", tbl_cell_right),
        ],
        [
            Paragraph("TOTAL BERSIH (USD)", tbl_cell_bold),
            Paragraph("<b>$897.81</b>", tbl_cell_right_bold),
            Paragraph("<b>$849.42</b>", tbl_cell_right_bold),
            Paragraph("<b>$895.21</b>", tbl_cell_right_bold),
        ],
        [
            Paragraph("ESTIMASI BERSIH (IDR)", tbl_cell_bold),
            Paragraph("<b>Rp14.364.960</b>", tbl_cell_right_bold),
            Paragraph("<b>Rp13.590.720</b>", tbl_cell_right_bold),
            Paragraph("<b>Rp14.323.360</b>", tbl_cell_right_bold),
        ],
        [
            Paragraph("Efisiensi Take-Home Pay", tbl_cell_bold),
            Paragraph("<b>89.78%</b>", tbl_cell_right_bold),
            Paragraph("<b>84.94%</b>", tbl_cell_right_bold),
            Paragraph("<b>89.52%</b>", tbl_cell_right_bold),
        ]
    ]

    t_sim_pdf = Table(sim_pdf_data, colWidths=[150, 127, 127, 128])
    t_sim_pdf.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), PRIMARY),
        ('ALIGN', (0,0), (-1,0), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('INNERGRID', (0,0), (-1,-1), 0.3, colors.HexColor("#D8E2EC")),
        ('BOX', (0,0), (-1,-1), 0.8, PRIMARY),
        ('TOPPADDING', (0,0), (-1,-1), 2.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2.5),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
        ('BACKGROUND', (0,1), (-1,1), LIGHT_BG),
        ('BACKGROUND', (0,3), (-1,3), LIGHT_BG),
        ('BACKGROUND', (0,5), (-1,5), LIGHT_BG),
        ('BACKGROUND', (0,6), (-1,8), colors.HexColor("#EBF3FA")),
    ]))
    story.append(t_sim_pdf)
    story.append(Spacer(1, 6))

    # Section 7: Tanya Jawab & Troubleshooting
    story.append(Paragraph("7. Tanya Jawab & Pemecahan Masalah (Troubleshooting)", h1_style))
    faqs_pdf = [
        ("Muncul pesan 'Manifest file is missing' saat mengklik Load unpacked:",
         "Pastikan Anda memilih folder root utama tempat file <code>manifest.json</code> berada, bukan memilih folder zip atau subfolder lain."),
        
        ("Ekstensi hilang setelah browser Google Chrome ditutup dan dibuka kembali:",
         "Hal ini terjadi apabila folder ekstensi dipindahkan ke lokasi lain atau dihapus. Pastikan folder <code>d:\\Aplikasi DIY\\Upwork Calc</code> tetap di lokasi semula."),
        
        ("Tombol Deteksi tidak merespons di halaman Upwork:",
         "Pastikan tab Upwork yang sedang dibuka sudah selesai dimuat (loading selesai) dan URL diawali dengan <code>https://www.upwork.com/</code>."),
        
        ("Nilai kurs valas tidak terupdate otomatis:",
         "Pastikan koneksi internet aktif. Jika koneksi terhalang firewall/proxy, Anda dapat langsung mengetikkan nilai kurs secara manual pada kolom kurs di menu Pengaturan.")
    ]
    for q_t, a_t in faqs_pdf:
        story.append(Paragraph(f"<b>Q: {q_t}</b>", h2_style))
        story.append(Paragraph(f"<b>Jawab:</b> {a_t}", body_style))

    # Build Document
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"File PDF berhasil dibuat di: {filename}")

if __name__ == "__main__":
    out_pdf = r"d:\Aplikasi DIY\Upwork Calc\User_Guide_FreeUp_Calc.pdf"
    create_user_guide_pdf(out_pdf)
