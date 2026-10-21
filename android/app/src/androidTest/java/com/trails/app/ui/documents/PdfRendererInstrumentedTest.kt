package com.trails.app.ui.documents

import android.graphics.Color
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class PdfRendererInstrumentedTest {
    @Test
    fun platformPdfRendererRendersGeneratedPageAndReturnedBitmapIsOwnedByCaller() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val file = File(context.cacheDir, "renderer-test.pdf")
        val document = PdfDocument()
        val page = document.startPage(PdfDocument.PageInfo.Builder(80, 60, 1).create())
        page.canvas.drawColor(Color.WHITE)
        page.canvas.drawRect(10f, 10f, 30f, 30f, Paint().apply { color = Color.RED })
        document.finishPage(page)
        file.outputStream().use(document::writeTo)
        document.close()

        val rendered = renderPdfPage(file, 0)

        assertEquals(1, rendered.pageCount)
        assertEquals(80, rendered.bitmap.width)
        assertEquals(60, rendered.bitmap.height)
        assertFalse(rendered.bitmap.isRecycled)
        rendered.bitmap.recycle()
        assertTrue(rendered.bitmap.isRecycled)
        file.delete()
    }
}
