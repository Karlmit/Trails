package com.trails.app.ui.blog

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.dp
import com.trails.app.ui.theme.TrailsTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class BlogBlockReorderingTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun `dragging a paragraph over an image drops it before the image`() {
        var blocks by mutableStateOf(listOf(
            EditableBlock.Image("image", "photo"),
            EditableBlock.Text("paragraph", TextBlockKind.PARAGRAPH, listOf(InlineRun("Trip"))),
        ))
        val drops = mutableListOf<Pair<String, String?>>()
        compose.setContent {
            TrailsTheme {
                val drag = remember { BlogBlockDrag() }
                Column(Modifier.height(240.dp).verticalScroll(rememberScrollState())) {
                    blocks.forEach { block ->
                        Column(
                            Modifier.height(100.dp)
                                .testTag(block.id)
                                .onGloballyPositioned { drag.updateCenter(block.id, it) },
                        ) {
                            BlogBlockDragHandle(
                                id = block.id,
                                drag = drag,
                                enabled = true,
                                onDrop = {
                                    val beforeId = drag.beforeId(blocks)
                                    drops.add(block.id to beforeId)
                                    if (beforeId == "image") blocks = blocks.reversed()
                                },
                                onMoveUp = if (block.id == "paragraph") ({}) else null,
                                onMoveDown = if (block.id == "image") ({}) else null,
                            )
                        }
                    }
                    Spacer(Modifier.height(200.dp))
                }
            }
        }

        compose.onNodeWithTag("paragraph").performTouchInput {
            down(Offset(18.dp.toPx(), 18.dp.toPx()))
            moveBy(Offset(0f, -40.dp.toPx()))
            moveBy(Offset(0f, -60.dp.toPx()))
            up()
        }

        compose.runOnIdle {
            assertEquals(listOf("paragraph" to "image"), drops)
            assertEquals(listOf("paragraph", "image"), blocks.map { it.id })
        }
    }
}
