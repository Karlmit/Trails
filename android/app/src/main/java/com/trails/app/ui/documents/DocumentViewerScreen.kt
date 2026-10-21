package com.trails.app.ui.documents

import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.testTag
import coil3.compose.SubcomposeAsyncImage
import coil3.compose.SubcomposeAsyncImageContent
import com.trails.app.R
import com.trails.app.ui.theme.TrailsColors
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

internal enum class DocumentPreviewType { IMAGE, PDF, UNSUPPORTED }

internal fun documentPreviewType(mimeType: String, filename: String): DocumentPreviewType {
    val normalized = mimeType.substringBefore(';').trim().lowercase()
    val extension = filename.substringAfterLast('.', "").lowercase()
    val isGeneric = normalized.isBlank() || normalized == "application/octet-stream" || normalized == "binary/octet-stream"
    return when {
        normalized.startsWith("image/") -> DocumentPreviewType.IMAGE
        normalized == "application/pdf" -> DocumentPreviewType.PDF
        isGeneric && extension in setOf("jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "heif") -> DocumentPreviewType.IMAGE
        isGeneric && extension == "pdf" -> DocumentPreviewType.PDF
        else -> DocumentPreviewType.UNSUPPORTED
    }
}

internal data class RenderedPdfPage(val bitmap: Bitmap, val pageCount: Int)
private sealed interface PdfLoadState {
    data object Loading : PdfLoadState
    data object Error : PdfLoadState
    data class Ready(val page: RenderedPdfPage) : PdfLoadState
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun DocumentViewerScreen(
    localPath: String,
    mimeType: String,
    filename: String,
    onBack: () -> Unit,
    onShare: () -> Unit,
    onOpenExternal: () -> Unit,
    pdfRenderer: suspend (File, Int) -> RenderedPdfPage = { file, page -> renderPdfPage(file, page) },
) {
    var menuExpanded by remember { mutableStateOf(false) }
    Scaffold(
        containerColor = Color(0xFF171A19),
        topBar = {
            TopAppBar(
                title = { Text(filename, maxLines = 1) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.shell_cd_back))
                    }
                },
                actions = {
                    IconButton(onClick = { menuExpanded = true }) {
                        Icon(Icons.Default.MoreVert, contentDescription = stringResource(R.string.document_more_actions))
                    }
                    DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.document_share)) },
                            onClick = { menuExpanded = false; onShare() },
                        )
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.document_open_external)) },
                            onClick = { menuExpanded = false; onOpenExternal() },
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = TrailsColors.BrandDeep,
                    titleContentColor = Color.White,
                    navigationIconContentColor = Color.White,
                    actionIconContentColor = Color.White,
                ),
            )
        },
    ) { padding ->
        when (documentPreviewType(mimeType, filename)) {
            DocumentPreviewType.IMAGE -> SubcomposeAsyncImage(
                model = File(localPath),
                contentDescription = filename,
                contentScale = ContentScale.Fit,
                modifier = Modifier.padding(padding).fillMaxSize().testTag("document-image-preview"),
                loading = { CircularProgressIndicator(color = Color.White) },
                error = { Text(stringResource(R.string.document_viewer_error), color = Color.White) },
                success = { SubcomposeAsyncImageContent() },
            )
            DocumentPreviewType.PDF -> PdfViewer(File(localPath), pdfRenderer, Modifier.padding(padding))
            DocumentPreviewType.UNSUPPORTED -> UnsupportedViewer(
                onOpenExternal = onOpenExternal,
                modifier = Modifier.padding(padding),
            )
        }
    }
}

@Composable
private fun PdfViewer(
    file: File,
    renderer: suspend (File, Int) -> RenderedPdfPage,
    modifier: Modifier = Modifier,
) {
    var pageIndex by remember(file) { mutableIntStateOf(0) }
    var retryKey by remember(file, pageIndex) { mutableIntStateOf(0) }
    val state by produceState<PdfLoadState>(PdfLoadState.Loading, file, pageIndex, retryKey) {
        value = withContext(Dispatchers.IO) {
            runCatching { renderer(file, pageIndex) }
                .fold(onSuccess = PdfLoadState::Ready, onFailure = { PdfLoadState.Error })
        }
    }
    Box(modifier = modifier.fillMaxSize().background(Color(0xFF171A19)).testTag("document-pdf-preview")) {
        when (val current = state) {
            PdfLoadState.Loading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = Color.White)
            PdfLoadState.Error -> Column(
                modifier = Modifier.align(Alignment.Center).testTag("document-pdf-error"),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(stringResource(R.string.document_viewer_error), color = Color.White)
                Button(onClick = { retryKey++ }, modifier = Modifier.padding(top = 12.dp)) {
                    Text(stringResource(R.string.shell_refresh))
                }
            }
            is PdfLoadState.Ready -> {
            val rendered = current.page
            DisposableEffect(rendered.bitmap) {
                onDispose { rendered.bitmap.recycle() }
            }
            Column(
                modifier = Modifier.fillMaxSize().padding(12.dp).testTag("document-pdf-ready"),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                androidx.compose.foundation.Image(
                    bitmap = rendered.bitmap.asImageBitmap(),
                    contentDescription = stringResource(R.string.document_page_count, pageIndex + 1, rendered.pageCount),
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.weight(1f).sizeIn(maxWidth = 1200.dp),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Button(onClick = { pageIndex-- }, enabled = pageIndex > 0) {
                        Text(stringResource(R.string.document_previous_page))
                    }
                    Text(stringResource(R.string.document_page_count, pageIndex + 1, rendered.pageCount), color = Color.White)
                    Button(onClick = { pageIndex++ }, enabled = pageIndex + 1 < rendered.pageCount) {
                        Text(stringResource(R.string.document_next_page))
                    }
                }
            }
            }
        }
    }
}

/** Narrow test seam around the platform renderer; callers own and must recycle the bitmap. */
internal fun renderPdfPage(file: File, pageIndex: Int): RenderedPdfPage {
    return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
        PdfRenderer(descriptor).use { renderer ->
            val safeIndex = pageIndex.coerceIn(0, renderer.pageCount - 1)
            renderer.openPage(safeIndex).use { page ->
                val (width, height) = boundedPdfBitmapSize(page.width, page.height)
                val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                bitmap.eraseColor(android.graphics.Color.WHITE)
                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                RenderedPdfPage(bitmap, renderer.pageCount)
            }
        }
    }
}

internal fun boundedPdfBitmapSize(sourceWidth: Int, sourceHeight: Int): Pair<Int, Int> {
    require(sourceWidth > 0 && sourceHeight > 0)
    val maxDimension = 1600f
    val maxPixels = 3_000_000f
    val dimensionScale = minOf(1f, maxDimension / sourceWidth, maxDimension / sourceHeight)
    val pixelScale = kotlin.math.sqrt(maxPixels / (sourceWidth.toFloat() * sourceHeight)).coerceAtMost(1f)
    val scale = minOf(dimensionScale, pixelScale)
    return (sourceWidth * scale).toInt().coerceAtLeast(1) to (sourceHeight * scale).toInt().coerceAtLeast(1)
}

@Composable
private fun UnsupportedViewer(onOpenExternal: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxSize().padding(24.dp).testTag("document-unsupported-preview"),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(stringResource(R.string.document_unsupported), color = Color.White)
        Button(onClick = onOpenExternal, modifier = Modifier.padding(top = 16.dp)) {
            Text(stringResource(R.string.document_open_external))
        }
    }
}
