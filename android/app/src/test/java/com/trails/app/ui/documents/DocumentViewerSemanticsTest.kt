package com.trails.app.ui.documents

import android.content.Context
import android.graphics.Bitmap
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.waitUntilAtLeastOneExists
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.test.core.app.ApplicationProvider
import com.trails.app.R
import com.trails.app.ui.theme.TrailsTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File

@RunWith(RobolectricTestRunner::class)
@OptIn(ExperimentalTestApi::class)
class DocumentViewerSemanticsTest {
    @get:Rule val compose = createComposeRule()
    private val context = ApplicationProvider.getApplicationContext<Context>()

    @Test
    fun `image viewer exposes supported image semantics`() {
        val file = File.createTempFile("viewer", ".png")
        file.outputStream().use { Bitmap.createBitmap(2, 2, Bitmap.Config.ARGB_8888).compress(Bitmap.CompressFormat.PNG, 100, it) }

        show(file, "image/png", "map.png")

        compose.onNodeWithTag("document-image-preview").fetchSemanticsNode()
        file.delete()
    }

    @Test
    fun `pdf viewer exposes rendered page semantics`() {
        val file = File.createTempFile("viewer", ".pdf")
        writeTinyPdf(file, 40, 40)
        show(file, "application/pdf", "ticket.pdf", pdfRenderer = { _, _ ->
            RenderedPdfPage(Bitmap.createBitmap(40, 40, Bitmap.Config.ARGB_8888), 1)
        })

        compose.waitUntilAtLeastOneExists(hasTestTag("document-pdf-ready"))
        compose.onNodeWithTag("document-pdf-ready").assertIsDisplayed()
        file.delete()
    }

    @Test
    fun `pdf render error can retry into ready state`() {
        val file = File.createTempFile("viewer", ".pdf")
        var attempts = 0
        show(file, "application/pdf", "ticket.pdf", pdfRenderer = { _, _ ->
            attempts++
            if (attempts == 1) error("render failed")
            RenderedPdfPage(Bitmap.createBitmap(20, 20, Bitmap.Config.ARGB_8888), 1)
        })
        compose.waitUntilAtLeastOneExists(hasTestTag("document-pdf-error"))
        compose.onNodeWithText(context.getString(R.string.shell_refresh)).performClick()
        compose.waitUntilAtLeastOneExists(hasTestTag("document-pdf-ready"))
        file.delete()
    }

    @Test
    fun `unsupported viewer explains fallback and offers external open`() {
        val file = File.createTempFile("viewer", ".txt")
        val explanation = context.getString(R.string.document_unsupported)
        val external = context.getString(R.string.document_open_external)

        show(file, "text/plain", "notes.txt")

        compose.onNodeWithText(explanation).assertIsDisplayed()
        compose.onNodeWithText(external).assertIsDisplayed()
        compose.onNodeWithTag("document-unsupported-preview").assertIsDisplayed()
        file.delete()
    }

    private fun show(
        file: File,
        mime: String,
        name: String,
        pdfRenderer: suspend (File, Int) -> RenderedPdfPage = { target, page -> renderPdfPage(target, page) },
    ) {
        compose.setContent {
            TrailsTheme {
                DocumentViewerScreen(file.absolutePath, mime, name, {}, {}, {}, pdfRenderer)
            }
        }
    }
}
