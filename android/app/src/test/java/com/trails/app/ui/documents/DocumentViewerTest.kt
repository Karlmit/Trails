package com.trails.app.ui.documents

import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.ByteArrayOutputStream
import java.io.File

internal fun writeTinyPdf(file: File, width: Int = 80, height: Int = 60) {
    val output = ByteArrayOutputStream()
    val offsets = mutableListOf<Int>()
    fun append(value: String) = output.write(value.toByteArray(Charsets.US_ASCII))
    append("%PDF-1.4\n")
    fun obj(number: Int, body: String) {
        offsets += output.size()
        append("$number 0 obj\n$body\nendobj\n")
    }
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>")
    obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 $width $height] /Contents 4 0 R /Resources << >> >>")
    val commands = "1 0 0 rg 10 10 20 20 re f\n"
    obj(4, "<< /Length ${commands.length} >>\nstream\n${commands}endstream")
    val xref = output.size()
    append("xref\n0 5\n0000000000 65535 f \n")
    offsets.forEach { append(String.format(java.util.Locale.ROOT, "%010d 00000 n \n", it)) }
    append("trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n$xref\n%%EOF\n")
    file.writeBytes(output.toByteArray())
}

@RunWith(RobolectricTestRunner::class)
class DocumentViewerTest {
    @Test
    fun `image and pdf mime types open in Trails`() {
        assertEquals(DocumentPreviewType.IMAGE, documentPreviewType("image/jpeg", "photo.jpg"))
        assertEquals(DocumentPreviewType.PDF, documentPreviewType("application/pdf", "ticket.pdf"))
    }

    @Test
    fun `extensions recover missing mime and other files remain external`() {
        assertEquals(DocumentPreviewType.PDF, documentPreviewType("application/octet-stream", "ticket.PDF"))
        assertEquals(DocumentPreviewType.IMAGE, documentPreviewType("application/octet-stream", "map.webp"))
        assertEquals(DocumentPreviewType.UNSUPPORTED, documentPreviewType("text/plain", "notes.txt"))
        assertEquals(DocumentPreviewType.UNSUPPORTED, documentPreviewType("text/plain", "misleading.pdf"))
        assertEquals(DocumentPreviewType.PDF, documentPreviewType("application/pdf", "misleading.jpg"))
        assertEquals(1600 to 800, boundedPdfBitmapSize(4000, 2000))
        assertEquals(800 to 1600, boundedPdfBitmapSize(2000, 4000))
    }

}
