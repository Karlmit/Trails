package com.trails.app.ui.blog

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DragHandle
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.trails.app.R

internal class BlogBlockDrag {
    val centers = mutableStateMapOf<String, Float>()
    var viewport: LayoutCoordinates? = null
    var draggedId by mutableStateOf<String?>(null)
    var pointerY by mutableFloatStateOf(0f)

    fun updateCenter(id: String, coordinates: LayoutCoordinates) {
        centers[id] = coordinates.localToWindow(Offset(0f, coordinates.size.height / 2f)).y
    }

    fun beforeId(blocks: List<EditableBlock>): String? = blocks.firstOrNull { block ->
        block.id != draggedId && centers[block.id]?.let { pointerY < it } == true
    }?.id

    fun clear() {
        draggedId = null
    }
}

@Composable
internal fun AutoScrollBlogDrag(drag: BlogBlockDrag, scroll: ScrollState) {
    val edge = with(LocalDensity.current) { 64.dp.toPx() }
    val speed = with(LocalDensity.current) { 850.dp.toPx() }
    LaunchedEffect(drag.draggedId, edge, speed) {
        if (drag.draggedId == null) return@LaunchedEffect
        var lastFrame = withFrameNanos { it }
        while (drag.draggedId != null) {
            val frame = withFrameNanos { it }
            val elapsed = ((frame - lastFrame) / 1_000_000_000f).coerceAtMost(0.05f)
            lastFrame = frame
            val viewport = drag.viewport?.takeIf { it.isAttached } ?: continue
            val top = viewport.localToWindow(Offset.Zero).y
            val bottom = top + viewport.size.height
            val zone = edge.coerceAtMost(viewport.size.height / 2f)
            if (zone <= 0f) continue
            val direction = when {
                drag.pointerY < top + zone -> -(top + zone - drag.pointerY) / zone
                drag.pointerY > bottom - zone -> (drag.pointerY - bottom + zone) / zone
                else -> 0f
            }
            if (direction != 0f) scroll.dispatchRawDelta(direction.coerceIn(-1f, 1f) * speed * elapsed)
        }
    }
}

@Composable
internal fun BlogBlockDragHandle(
    id: String,
    drag: BlogBlockDrag,
    enabled: Boolean,
    onDrop: () -> Unit,
    onMoveUp: (() -> Unit)?,
    onMoveDown: (() -> Unit)?,
) {
    val label = stringResource(R.string.blog_reorder_block)
    val moveUp = stringResource(R.string.blog_move_block_up)
    val moveDown = stringResource(R.string.blog_move_block_down)
    val currentDrop by rememberUpdatedState(onDrop)
    var coordinates by remember { mutableStateOf<LayoutCoordinates?>(null) }
    var menuExpanded by remember { mutableStateOf(false) }
    val canMove = enabled && (onMoveUp != null || onMoveDown != null)
    Box(
        Modifier.size(48.dp)
            .onGloballyPositioned { coordinates = it }
            .pointerInput(id, canMove) {
                if (!canMove) return@pointerInput
                try {
                    detectDragGestures(
                        onDragEnd = {
                            if (drag.draggedId == id) currentDrop()
                            drag.clear()
                        },
                        onDragCancel = drag::clear,
                    ) { change, _ ->
                        val handle = coordinates?.takeIf { it.isAttached } ?: return@detectDragGestures
                        change.consume()
                        drag.pointerY = handle.localToWindow(change.position).y
                        drag.draggedId = id
                    }
                } finally {
                    if (drag.draggedId == id) drag.clear()
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        IconButton(
            onClick = { menuExpanded = true },
            enabled = canMove,
            modifier = Modifier.semantics {
                contentDescription = label
                if (canMove) {
                    customActions = buildList {
                        onMoveUp?.let { move ->
                            add(CustomAccessibilityAction(moveUp) {
                                move()
                                true
                            })
                        }
                        onMoveDown?.let { move ->
                            add(CustomAccessibilityAction(moveDown) {
                                move()
                                true
                            })
                        }
                    }
                }
            },
        ) {
            Icon(Icons.Filled.DragHandle, contentDescription = null)
        }
        DropdownMenu(expanded = menuExpanded && canMove, onDismissRequest = { menuExpanded = false }) {
            onMoveUp?.let { move ->
                DropdownMenuItem(
                    text = { Text(moveUp) },
                    onClick = {
                        menuExpanded = false
                        move()
                    },
                )
            }
            onMoveDown?.let { move ->
                DropdownMenuItem(
                    text = { Text(moveDown) },
                    onClick = {
                        menuExpanded = false
                        move()
                    },
                )
            }
        }
    }
}
