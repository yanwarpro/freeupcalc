import os
import docx
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, hex_color):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(f'<w:tcMar {nsdecls("w")}><w:top w:w="{top}" w:type="dxa"/><w:bottom w:w="{bottom}" w:type="dxa"/><w:left w:w="{left}" w:type="dxa"/><w:right w:w="{right}" w:type="dxa"/></w:tcMar>')
    tcPr.append(tcMar)

def create_user_guide_docx(filepath):
    doc = Document()
    
    # Page setup - Margins
    for section in doc.sections:
        section.top_margin = Inches(0.8)
        section.bottom_margin = Inches(0.8)
        section.left_margin = Inches(0.8)
        section.right_margin = Inches(0.8)

    # Color Palette: Deep Slate & Teal
    COLOR_PRIMARY = RGBColor(15, 76, 129)     # Classic Teal / Blue #0F4C81
    COLOR_SECONDARY = RGBColor(38, 166, 154) # Teal Accent #26A69A
    COLOR_DARK = RGBColor(40, 44, 52)        # Charcoal #282C34
    COLOR_MUTED = RGBColor(100, 110, 120)    # Gray
    
    # Styles Setup
    normal_style = doc.styles['Normal']
    normal_style.font.name = 'Calibri'
    normal_style.font.size = Pt(10.5)
    normal_style.font.color.rgb = COLOR_DARK
    normal_style.paragraph_format.line_spacing = 1.18
    normal_style.paragraph_format.space_after = Pt(4)

    # Document Header Title
    title_p = doc.add_paragraph()
    title_p.paragraph_format.space_before = Pt(0)
    title_p.paragraph_format.space_after = Pt(2)
    run_title = title_p.add_run("PANDUAN PENGGUNA (USER GUIDE)")
    run_title.font.size = Pt(20)
    run_title.font.bold = True
    run_title.font.color.rgb = COLOR_PRIMARY

    sub_p = doc.add_paragraph()
    sub_p.paragraph_format.space_after = Pt(12)
    run_sub = sub_p.add_run("Ekstensi Google Chrome: FreeUp Calc (Upwork & Freelancer Fee Calculator)")
    run_sub.font.size = Pt(13)
    run_sub.font.bold = True
    run_sub.font.color.rgb = COLOR_SECONDARY

    # Metadata Info Box
    meta_table = doc.add_table(rows=4, cols=2)
    meta_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    meta_table.autofit = False

    meta_info = [
        ("Nama Ekstensi", "FreeUp Calc (Upwork Calc)"),
        ("Versi Ekstensi", "1.0.0 (Manifest V3 Compatible)"),
        ("Target Platform", "Upwork & Freelancer.com"),
        ("Tujuan Aplikasi", "Menghitung rincian potongan (Platform Fee, Connects, VAT, Withdrawal, FX) dan estimasi pendapatan bersih (Take-Home Pay) dalam USD & IDR.")
    ]

    col_widths = [Inches(1.8), Inches(5.1)]
    for r_idx, (label, val) in enumerate(meta_info):
        row = meta_table.rows[r_idx]
        
        c0 = row.cells[0]
        c0.width = col_widths[0]
        set_cell_background(c0, "F0F4F8")
        set_cell_margins(c0, 80, 80, 120, 120)
        p0 = c0.paragraphs[0]
        p0.paragraph_format.space_after = Pt(0)
        r0 = p0.add_run(label)
        r0.font.bold = True
        r0.font.size = Pt(9.5)
        r0.font.color.rgb = COLOR_PRIMARY
        
        c1 = row.cells[1]
        c1.width = col_widths[1]
        set_cell_background(c1, "FAFCFF")
        set_cell_margins(c1, 80, 80, 120, 120)
        p1 = c1.paragraphs[0]
        p1.paragraph_format.space_after = Pt(0)
        r1 = p1.add_run(val)
        r1.font.size = Pt(9.5)
        r1.font.color.rgb = COLOR_DARK

    doc.add_paragraph().paragraph_format.space_after = Pt(6)

    # Helper function for Section Headings
    def add_h1(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(14)
        p.paragraph_format.space_after = Pt(4)
        run = p.add_run(text)
        run.font.size = Pt(13)
        run.font.bold = True
        run.font.color.rgb = COLOR_PRIMARY
        return p

    def add_h2(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(8)
        p.paragraph_format.space_after = Pt(3)
        run = p.add_run(text)
        run.font.size = Pt(11.5)
        run.font.bold = True
        run.font.color.rgb = COLOR_SECONDARY
        return p

    def add_callout(text, title="PENTING:"):
        callout_tbl = doc.add_table(rows=1, cols=1)
        callout_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
        cell = callout_tbl.rows[0].cells[0]
        cell.width = Inches(6.9)
        set_cell_background(cell, "EBF3FA")
        set_cell_margins(cell, 100, 100, 140, 140)
        cp = cell.paragraphs[0]
        cp.paragraph_format.space_after = Pt(0)
        r_t = cp.add_run(f"[{title}] ")
        r_t.font.bold = True
        r_t.font.size = Pt(9.5)
        r_t.font.color.rgb = COLOR_PRIMARY
        r_b = cp.add_run(text)
        r_b.font.size = Pt(9.5)
        r_b.font.color.rgb = COLOR_DARK
        doc.add_paragraph().paragraph_format.space_after = Pt(4)

    # 1. PENDAHULUAN
    add_h1("1. PENDAHULUAN & GAMBARAN UMUM")
    p = doc.add_paragraph()
    p.add_run("FreeUp Calc adalah ekstensi browser Google Chrome yang dibuat khusus untuk para freelancer di platform Upwork dan Freelancer.com. Seringkali freelancer hanya memperhitungkan nominal tawaran (bid), tanpa menyadari bahwa nilai akhir yang diterima di rekening bank lokal akan terpotong oleh berbagai komponen biaya:")
    
    bullets_p1 = [
        ("Platform Service Fee: ", "Biaya komisi platform (misalnya 10% di Upwork atau 10% dengan batas minimum $5 di Freelancer.com)."),
        ("Biaya Connects: ", "Pengeluaran pembelian connects yang digunakan saat mengajukan proposal (default $0.15/connect)."),
        ("Pajak VAT / GST: ", "Pajak pertambahan nilai pada service fee bagi pengguna di wilayah tertentu yang belum mendaftarkan Tax ID."),
        ("Biaya Penarikan (Withdrawal Fee): ", "Biaya transfer platform sesuai metode penarikan (misal $0.99 untuk Local Bank, $2 untuk PayPal, $50 untuk Wire Transfer)."),
        ("Biaya Provider / E-Wallet: ", "Potongan persentase dari payment gateway (misal PayPal ~2.9%, Payoneer ~0.5%)."),
        ("Selisih Kurs (FX Margin): ", "Selisih spread nilai tukar mata uang asing yang diterapkan oleh bank penyedia layanan.")
    ]
    for b_title, b_desc in bullets_p1:
        bp = doc.add_paragraph(style='List Bullet')
        bp.paragraph_format.space_after = Pt(2)
        r_bt = bp.add_run(b_title)
        r_bt.font.bold = True
        bp.add_run(b_desc)

    p_end = doc.add_paragraph()
    p_end.add_run("Dengan FreeUp Calc, Anda dapat langsung mengetahui jumlah uang bersih (Take-Home Pay) dalam mata uang USD maupun mata uang lokal (seperti Rupiah / IDR) secara transparan sebelum mengirimkan proposal.")

    # 2. PERSYARATAN SISTEM
    add_h1("2. PERSYARATAN SISTEM")
    bullets_p2 = [
        ("Browser yang Didukung: ", "Google Chrome versi 88+ (atau browser berbasis Chromium seperti Microsoft Edge, Brave, Opera)."),
        ("Format Ekstensi: ", "Folder Developer Mode (Unpacked Extension / Manifest V3)."),
        ("Hak Akses Izin: ", "storage (menyimpan konfigurasi opsi), activeTab & scripting (membaca nilai bid dan connects di tab Upwork)."),
        ("Koneksi Internet: ", "Diperlukan untuk memperbarui nilai kurs valas secara otomatis dari API Bank Indonesia.")
    ]
    for b_title, b_desc in bullets_p2:
        bp = doc.add_paragraph(style='List Bullet')
        bp.paragraph_format.space_after = Pt(2)
        r_bt = bp.add_run(b_title)
        r_bt.font.bold = True
        bp.add_run(b_desc)

    # 3. PANDUAN LANGKAH DEMI LANGKAH INSTALASI
    add_h1("3. LANGKAH STEP-BY-STEP INSTALASI DI GOOGLE CHROME")
    doc.add_paragraph("Karena ekstensi ini disediakan dalam bentuk kode sumber (folder direktori lokal), Anda dapat memasangnya menggunakan fitur Developer Mode di Chrome dengan 5 langkah mudah berikut:")

    steps = [
        ("Langkah 1: Siapkan Folder Ekstensi di Komputer",
         "Pastikan seluruh berkas ekstensi berada dalam satu folder tetap yang rapi (misalnya: d:\\Aplikasi DIY\\Upwork Calc). Di dalam folder tersebut harus terdapat file manifest.json, popup.html, popup.js, calculator.js, options.html, content.js, dan folder icons/.\n*Catatan: Jangan menghapus atau memindahkan folder ini setelah diinstal, karena Chrome memuat file langsung dari folder ini.*"),
        
        ("Langkah 2: Buka Halaman Ekstensi Google Chrome",
         "Buka browser Google Chrome Anda. Kemudian, akses halaman ekstensi dengan salah satu cara berikut:\n• Ketik chrome://extensions pada address bar (kolom URL) Chrome lalu tekan Enter.\n• Atau klik Menu Titik Tiga (⋮) di pojok kanan atas Chrome > pilih 'Extensions' (Ekstensi) > klik 'Manage Extensions' (Kelola Ekstensi)."),
        
        ("Langkah 3: Aktifkan 'Developer Mode' (Mode Pengembang)",
         "Di pojok kanan atas halaman Extensions, temukan sakelar toggle bertuliskan 'Developer mode' (Mode Pengembang).\nKlik toggle tersebut ke posisi AKTIF (ON / berwarna biru). Setelah aktif, tiga tombol baru akan muncul di toolbar atas: 'Load unpacked', 'Pack extension', dan 'Update'."),
        
        ("Langkah 4: Klik 'Load unpacked' dan Pilih Folder Ekstensi",
         "1. Klik tombol 'Load unpacked' (Muat yang belum dibongkar) di pojok kiri atas.\n2. Jendela File Explorer akan terbuka.\n3. Cari dan klik sekali pada folder ekstensi Anda (d:\\Aplikasi DIY\\Upwork Calc).\n4. Klik tombol 'Select Folder' (Pilih Folder)."),
        
        ("Langkah 5: Verifikasi Instalasi & Sematkan Ikon (Pin to Toolbar)",
         "Kartu ekstensi 'FreeUp Calc' versi 1.0.0 akan langsung muncul di daftar ekstensi dengan status Aktif.\nAgar mudah diakses setiap saat:\n1. Klik ikon Puzzle (Ekstensi) di sebelah kanan address bar Chrome.\n2. Cari 'FreeUp Calc' lalu klik ikon Pin (Sematkan) hingga berwarna biru.\n3. Ikon FreeUp Calc ($) kini akan selalu tampil di toolbar atas browser Anda.")
    ]

    for s_title, s_desc in steps:
        add_h2(s_title)
        sp = doc.add_paragraph()
        sp.paragraph_format.space_after = Pt(4)
        sp.add_run(s_desc)

    add_callout("Jika Anda melakukan perubahan pada kode file ekstensi, cukup buka chrome://extensions lalu klik ikon putar (Reload) pada kartu FreeUp Calc untuk menerapkan perubahan secara instan.", "TIPS DEVELOPER")

    # 4. PANDUAN LENGKAP PENGGUNAAN FITUR
    add_h1("4. CARA PENGGUNAAN FITUR FREEUP CALC")
    
    add_h2("A. Fitur Auto-Detect di Halaman Upwork")
    doc.add_paragraph("FreeUp Calc memiliki kecerdasan untuk membaca data proyek secara otomatis langsung dari halaman Upwork yang sedang Anda buka:")
    doc.add_paragraph("1. Buka tab pekerjaan Upwork (halaman Job Details atau halaman Submit a Proposal).\n2. Klik ikon ekstensi FreeUp Calc di toolbar Chrome.\n3. Klik tombol Deteksi (ikon Kaca Pembesar) di pojok kanan atas popup.\n4. Ekstensi akan otomatis mengekstrak nilai Anggaran Tawaran (Bid Amount/Budget) dan Jumlah Connects yang dibutuhkan ke dalam formulir kalkulator.")

    add_h2("B. Kalkulasi Manual (Fixed-Price & Hourly)")
    doc.add_paragraph("Anda juga dapat memasukkan parameter proyek secara manual kapan saja:")
    calc_steps = [
        ("Pilih Platform: ", "Pilih antara Upwork atau Freelancer.com."),
        ("Pilih Tipe Proyek: ", "• Fixed-Price: Masukkan total nilai kontrak (USD) pada kolom 'Jumlah Bid'.\n• Hourly: Masukkan 'Hourly Rate' (tarif per jam dalam USD) dan 'Jumlah Jam' kerja yang diestimasi. Sistem otomatis menghitung total proyek."),
        ("Connects Terpakai: ", "Isi jumlah connects yang dihabiskan untuk melamar pekerjaan tersebut (misal: 4, 8, atau 16 connects)."),
        ("Metode Withdrawal: ", "Pilih rekening atau dompet digital tujuan penarikan dana Anda (misal: Direct to Local Bank, PayPal, Wise, Payoneer, dll).")
    ]
    for cs_title, cs_desc in calc_steps:
        cp = doc.add_paragraph(style='List Bullet')
        cp.paragraph_format.space_after = Pt(2)
        r_cst = cp.add_run(cs_title)
        r_cst.font.bold = True
        cp.add_run(cs_desc)

    add_h2("C. Membaca Rincian Pemotongan & Hasil Bersih")
    doc.add_paragraph("Di bagian bawah formulir, kalkulator akan langsung memecah dan menampilkan rincian biaya:")
    
    # Table of fee details
    fee_table = doc.add_table(rows=7, cols=2)
    fee_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    fee_table.autofit = False
    
    fee_rows_data = [
        ("Service Fee Platform", "Potongan komisi Upwork (10%) atau Freelancer (10% min $5)."),
        ("VAT / GST", "Pajak atas service fee (jika negara Anda dikenakan pajak dan belum ada NPWP/Tax ID)."),
        ("Connect Cost", "Biaya total pembelian connects yang dihabiskan (jumlah connects x harga per connect)."),
        ("Withdrawal Fee", "Biaya transfer flat dari platform ke penyedia penarikan (misal $0.99 bank lokal, $2 PayPal)."),
        ("Provider Fee", "Biaya komisi dari gateway pembayaran (misal persentase PayPal/Payoneer)."),
        ("FX Conversion", "Estimasi selisih margin kurs jika dilakukan konversi mata uang."),
        ("HASIL BERSIH (Take-Home)", "Nominal bersih yang Anda terima (USD & Rupiah/IDR) beserta persentase efisiensi take-home.")
    ]

    for idx, (f_name, f_exp) in enumerate(fee_rows_data):
        row = fee_table.rows[idx]
        c0 = row.cells[0]
        c0.width = col_widths[0]
        set_cell_background(c0, "F0F4F8" if idx % 2 == 0 else "FFFFFF")
        set_cell_margins(c0, 60, 60, 100, 100)
        p0 = c0.paragraphs[0]
        p0.paragraph_format.space_after = Pt(0)
        r0 = p0.add_run(f_name)
        r0.font.bold = True
        r0.font.size = Pt(9)
        r0.font.color.rgb = COLOR_PRIMARY

        c1 = row.cells[1]
        c1.width = col_widths[1]
        set_cell_background(c1, "FAFCFF" if idx % 2 == 0 else "FFFFFF")
        set_cell_margins(c1, 60, 60, 100, 100)
        p1 = c1.paragraphs[0]
        p1.paragraph_format.space_after = Pt(0)
        r1 = p1.add_run(f_exp)
        r1.font.size = Pt(9)
        r1.font.color.rgb = COLOR_DARK

    doc.add_paragraph().paragraph_format.space_after = Pt(6)

    # 5. PANDUAN PENGATURAN & KUSTOMISASI
    add_h1("5. HALAMAN PENGATURAN (OPTIONS PAGE)")
    doc.add_paragraph("Setiap freelancer memiliki preferensi biaya dan metode penarikan yang berbeda. FreeUp Calc menyediakan halaman pengaturan lengkap:")
    doc.add_paragraph("Cara membuka: Klik tombol 'Pengaturan Fee →' di bagian bawah popup kalkulator, atau klik kanan ikon FreeUp Calc di toolbar Chrome lalu pilih 'Options' (Opsi).")

    opt_features = [
        ("Pilihan Platform: ", "Dapat mengonfigurasi pengaturan khusus untuk Upwork maupun Freelancer.com secara independen."),
        ("Service Fee Rate (%): ", "Sesuaikan persentase service fee (default 10%, dapat diubah jika Anda memiliki kontrak lama atau promo)."),
        ("Harga per Connect ($): ", "Harga default $0.15 per connect."),
        ("Pajak VAT/GST (%): ", "Isi 0% jika Anda telah memvalidasi NPWP/Tax ID, atau sesuaikan dengan tarif pajak negara Anda."),
        ("Target Currency: ", "Mata uang tujuan konversi (default: IDR untuk Rupiah Indonesia)."),
        ("Update Kurs Otomatis: ", "Terdapat tombol 'Update Otomatis' yang langsung mengambil nilai kurs acuan terbaru (misal Bank Indonesia) melalui koneksi API, atau Anda dapat mengetik angka kurs manual (contoh: 16250)."),
        ("Daftar Metode Withdrawal: ", "Anda dapat menyesuaikan Flat Fee (USD), Provider Rate (%), dan FX Margin (%) untuk masing-masing metode (PayPal, Payoneer, Wise ACH, Local Bank, Wire Transfer)."),
        ("Reset ke Default: ", "Tombol untuk mengembalikan seluruh pengaturan ke parameter standar pabrik kapan saja.")
    ]
    for o_title, o_desc in opt_features:
        op = doc.add_paragraph(style='List Bullet')
        op.paragraph_format.space_after = Pt(2)
        r_ot = op.add_run(o_title)
        r_ot.font.bold = True
        op.add_run(o_desc)

    # 6. STUDI KASUS SIMULASI NYATA
    add_h1("6. STUDI KASUS & SIMULASI PERHITUNGAN RIIL")
    doc.add_paragraph("Berikut adalah contoh perbandingan hasil bersih proyek Fixed-Price $1,000 di Upwork (menggunakan 8 connects = $1.20, kurs IDR Rp16.000):")

    sim_table = doc.add_table(rows=7, cols=4)
    sim_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    sim_table.autofit = False

    sim_headers = ["Komponen Biaya", "Direct Local Bank", "PayPal", "Wise (ACH Domestic)"]
    sim_widths = [Inches(2.1), Inches(1.6), Inches(1.6), Inches(1.6)]

    for c_i, h_txt in enumerate(sim_headers):
        cell = sim_table.rows[0].cells[c_i]
        cell.width = sim_widths[c_i]
        set_cell_background(cell, "0F4C81")
        set_cell_margins(cell, 80, 80, 100, 100)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(h_txt)
        r.font.bold = True
        r.font.size = Pt(9)
        r.font.color.rgb = RGBColor(255, 255, 255)

    sim_rows = [
        ("Nilai Kontrak (Bid)", "$1,000.00", "$1,000.00", "$1,000.00"),
        ("Upwork Service Fee (10%)", "- $100.00", "- $100.00", "- $100.00"),
        ("Connect Cost (8 Connects)", "- $1.20", "- $1.20", "- $1.20"),
        ("Withdrawal & Provider Fee", "- $0.99 (Flat)", "- $28.07 (Flat $2 + 2.9%)", "- $0.00 (Flat $0)"),
        ("Total Bersih Diterima (USD)", "$897.81", "$847.88", "$895.21"),
        ("Estimasi Rupiah (Kurs 16k)", "Rp14.364.960", "Rp13.566.080", "Rp14.323.360")
    ]

    for r_i, r_data in enumerate(sim_rows, start=1):
        row = sim_table.rows[r_i]
        is_highlight = r_i in [5, 6]
        bg_col = "E8F4F8" if is_highlight else ("FAFCFF" if r_i % 2 == 0 else "FFFFFF")
        
        for c_i, val in enumerate(r_data):
            cell = row.cells[c_i]
            cell.width = sim_widths[c_i]
            set_cell_background(cell, bg_col)
            set_cell_margins(cell, 60, 60, 100, 100)
            p = cell.paragraphs[0]
            if c_i > 0:
                p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            r = p.add_run(val)
            r.font.size = Pt(8.5)
            if is_highlight:
                r.font.bold = True
                r.font.color.rgb = COLOR_PRIMARY if c_i == 0 else COLOR_DARK

    doc.add_paragraph().paragraph_format.space_after = Pt(6)
    doc.add_paragraph("Dari simulasi di atas, terlihat jelas bahwa pemilihan metode withdrawal sangat berpengaruh besar pada take-home pay Anda (selisih hingga hampir Rp800.000 untuk proyek $1,000). FreeUp Calc membantu Anda mengambil keputusan keuangan terbaik.")

    # 7. FAQ & TROUBLESHOOTING
    add_h1("7. TANYA JAWAB & PEMECAHAN MASALAH (FAQ & TROUBLESHOOTING)")
    faqs = [
        ("Q: Mengapa muncul peringatan 'Manifest file is missing' saat Load unpacked?",
         "A: Pastikan Anda memilih folder root yang memuat berkas 'manifest.json' secara langsung, bukan memilih subfolder lain atau file zip."),
        
        ("Q: Ekstensi hilang saat Google Chrome ditutup dan dibuka kembali?",
         "A: Hal ini terjadi jika folder ekstensi dipindahkan ke direktori lain atau dihapus. Pastikan folder 'd:\\Aplikasi DIY\\Upwork Calc' tetap berada di tempatnya dan tidak diganti namanya."),
        
        ("Q: Tombol Deteksi tidak berhasil membaca nominal bid di Upwork?",
         "A: Pastikan Anda berada pada tab aktif halaman pekerjaan Upwork dan halaman telah selesai dimuat (fully loaded). Jika struktur antarmuka Upwork berubah, Anda tetap dapat memasukkan nominal bid secara manual di kolom input."),
         
        ("Q: Bagaimana cara memperbarui ekstensi jika ada pembaruan kode?",
         "A: Buka chrome://extensions, cari kartu 'FreeUp Calc', lalu klik ikon panah melingkar (Reload / Muat ulang).")
    ]

    for q_txt, a_txt in faqs:
        qp = doc.add_paragraph()
        qp.paragraph_format.space_before = Pt(4)
        qp.paragraph_format.space_after = Pt(1)
        rq = qp.add_run(q_txt)
        rq.font.bold = True
        rq.font.color.rgb = COLOR_PRIMARY

        ap = doc.add_paragraph()
        ap.paragraph_format.space_after = Pt(4)
        ap.add_run(a_txt)

    # Save document
    doc.save(filepath)
    print(f"File DOCX berhasil dibuat di: {filepath}")

if __name__ == "__main__":
    out_path = r"d:\Aplikasi DIY\Upwork Calc\User_Guide_FreeUp_Calc.docx"
    create_user_guide_docx(out_path)
