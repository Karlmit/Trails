package com.trails.app.ui.documents

import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsPropertyKey
import androidx.compose.ui.semantics.SemanticsPropertyReceiver
import androidx.compose.ui.semantics.semantics
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

internal const val MinDocumentScale = 1f
internal const val MaxDocumentScale = 5f

internal data class DocumentTransform(val scale: Float = MinDocumentScale, val translation: Offset = Offset.Zero)

internal val DocumentScaleKey = SemanticsPropertyKey<Float>("DocumentScale")
internal var SemanticsPropertyReceiver.documentScale by DocumentScaleKey
internal val DocumentTranslationKey = SemanticsPropertyKey<Offset>("DocumentTranslation")
internal var SemanticsPropertyReceiver.documentTranslation by DocumentTranslationKey

internal fun fittedDocumentSize(contentWidth: Float, contentHeight: Float, viewportWidth: Float, viewportHeight: Float): Size {
    if (contentWidth <= 0f || contentHeight <= 0f || viewportWidth <= 0f || viewportHeight <= 0f) return Size.Zero
    val fitScale = minOf(viewportWidth / contentWidth, viewportHeight / contentHeight)
    return Size(contentWidth * fitScale, contentHeight * fitScale)
}

internal fun updateDocumentTransform(
    current: DocumentTransform,
    zoomChange: Float,
    panChange: Offset,
    centroid: Offset,
    contentWidth: Float,
    contentHeight: Float,
    viewportWidth: Float,
    viewportHeight: Float,
): DocumentTransform {
    val scale = (current.scale * zoomChange).coerceIn(MinDocumentScale, MaxDocumentScale)
    if (scale == MinDocumentScale || viewportWidth <= 0f || viewportHeight <= 0f) {
        return DocumentTransform()
    }
    val fitted = fittedDocumentSize(contentWidth, contentHeight, viewportWidth, viewportHeight)
    val maxX = ((fitted.width * scale - viewportWidth) / 2f).coerceAtLeast(0f)
    val maxY = ((fitted.height * scale - viewportHeight) / 2f).coerceAtLeast(0f)
    val scaleChange = scale / current.scale
    val centroidFromCenter = centroid - Offset(viewportWidth / 2f, viewportHeight / 2f)
    val translation = centroidFromCenter - (centroidFromCenter - current.translation) * scaleChange + panChange
    return DocumentTransform(
        scale = scale,
        translation = Offset(
            x = translation.x.coerceIn(-maxX, maxX),
            y = translation.y.coerceIn(-maxY, maxY),
        ),
    )
}
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
            DocumentPreviewType.IMAGE -> ImageViewer(localPath, filename, Modifier.padding(padding))
            DocumentPreviewType.PDF -> PdfViewer(File(localPath), pdfRenderer, Modifier.padding(padding))
            DocumentPreviewType.UNSUPPORTED -> UnsupportedViewer(
                onOpenExternal = onOpenExternal,
                modifier = Modifier.padding(padding),
            )
        }
    }
}

@Composable
private fun ImageViewer(localPath: String, filename: String, modifier: Modifier = Modifier) {
    var imageSize by remember(localPath) { mutableStateOf(Size.Zero) }
    var zoomEnabled by remember(localPath) { mutableStateOf(false) }
    ZoomableDocumentViewport(
        contentIdentity = localPath,
        contentSize = imageSize,
        enabled = zoomEnabled,
        modifier = modifier.fillMaxSize().testTag("document-image-preview"),
    ) {
        SubcomposeAsyncImage(
            model = File(localPath),
            contentDescription = filename,
            contentScale = ContentScale.Fit,
            modifier = Modifier.fillMaxSize(),
            loading = {
                SideEffect { zoomEnabled = false; imageSize = Size.Zero }
                CircularProgressIndicator(color = Color.White)
            },
            error = {
                SideEffect { zoomEnabled = false; imageSize = Size.Zero }
                Text(stringResource(R.string.document_viewer_error), color = Color.White)
            },
            success = {
                val intrinsicSize = painter.intrinsicSize
                SideEffect {
                    imageSize = intrinsicSize
                    zoomEnabled = intrinsicSize.width > 0f && intrinsicSize.height > 0f
                }
                SubcomposeAsyncImageContent()
            },
        )
    }
}

@Composable
private fun ZoomableDocumentViewport(
    contentIdentity: Any,
    contentSize: Size,
    enabled: Boolean = true,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    var transform by remember(contentIdentity) { mutableStateOf(DocumentTransform()) }
    var viewportWidth by remember(contentIdentity) { mutableIntStateOf(0) }
    var viewportHeight by remember(contentIdentity) { mutableIntStateOf(0) }
    LaunchedEffect(contentIdentity, enabled) {
        if (!enabled) transform = DocumentTransform()
    }
    Box(modifier = modifier) {
        Box(
            modifier = Modifier.fillMaxSize()
                .background(Color(0xFF171A19))
                .clipToBounds()
                .onSizeChanged {
                    viewportWidth = it.width
                    viewportHeight = it.height
                    transform = updateDocumentTransform(
                        current = transform,
                        zoomChange = 1f,
                        panChange = Offset.Zero,
                        centroid = Offset(it.width / 2f, it.height / 2f),
                        contentWidth = contentSize.width,
                        contentHeight = contentSize.height,
                        viewportWidth = it.width.toFloat(),
                        viewportHeight = it.height.toFloat(),
                    )
                }
                .pointerInput(contentIdentity, contentSize, enabled, viewportWidth, viewportHeight) {
                    if (!enabled) return@pointerInput
                    detectTransformGestures { centroid, pan, zoom, _ ->
                        transform = updateDocumentTransform(
                            current = transform,
                            zoomChange = zoom,
                            panChange = pan,
                            centroid = centroid,
                            contentWidth = contentSize.width,
                            contentHeight = contentSize.height,
                            viewportWidth = viewportWidth.toFloat(),
                            viewportHeight = viewportHeight.toFloat(),
                        )
                    }
                }
                .semantics {
                    documentScale = transform.scale
                    documentTranslation = transform.translation
                }
                .testTag("document-zoomable-viewport"),
            contentAlignment = Alignment.Center,
        ) {
            Box(
                modifier = Modifier.fillMaxSize().graphicsLayer {
                    scaleX = transform.scale
                    scaleY = transform.scale
                    translationX = transform.translation.x
                    translationY = transform.translation.y
                },
                contentAlignment = Alignment.Center,
            ) { content() }
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
                ZoomableDocumentViewport(
                    contentIdentity = "${file.absolutePath}:$pageIndex",
                    contentSize = Size(rendered.bitmap.width.toFloat(), rendered.bitmap.height.toFloat()),
                    modifier = Modifier.weight(1f).fillMaxSize(),
                ) {
                    androidx.compose.foundation.Image(
                        bitmap = rendered.bitmap.asImageBitmap(),
                        contentDescription = stringResource(R.string.document_page_count, pageIndex + 1, rendered.pageCount),
                        contentScale = ContentScale.Fit,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
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
                try {
                    bitmap.eraseColor(android.graphics.Color.WHITE)
                    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                } catch (failure: Throwable) {
                    bitmap.recycle()
                    throw failure
                }
                RenderedPdfPage(bitmap, renderer.pageCount)
            }
        }
    }
}

internal fun boundedPdfBitmapSize(sourceWidth: Int, sourceHeight: Int): Pair<Int, Int> {
    require(sourceWidth > 0 && sourceHeight > 0)
    val targetScale = 5.0
    val maxDimension = 4096.0
    val maxPixels = 12_000_000.0
    val sourcePixels = sourceWidth.toDouble() * sourceHeight.toDouble()
    val dimensionScale = minOf(maxDimension / sourceWidth, maxDimension / sourceHeight)
    val pixelScale = kotlin.math.sqrt(maxPixels / sourcePixels)
    val scale = minOf(targetScale, dimensionScale, pixelScale)
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
