package com.trails.app.ui.timeline.graph

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.trails.app.ui.theme.TrailsColors

// Ported from app/(web)/trips/[tripId]/timeline/page.tsx's LANE_UNIT/
// TRUNK_X/laneX/branchPath -- same GitKraken-style branch/merge shape,
// just drawn in real pixels for this row's actual height instead of a
// stretched 0..100 SVG viewBox (Compose lays out this row's height from
// its content column first, via the caller's IntrinsicSize.Min Row, so
// there's no need for the web's viewBox-stretch trick here).
val LANE_UNIT: Dp = 16.dp
val TRUNK_X_UNITS = 0.5f

fun laneXUnits(laneIndex: Int): Float = (laneIndex + 1) + 0.5f

fun graphWidthFor(laneCount: Int): Dp = LANE_UNIT * (laneCount + 1)

private val GapDash = Color.Black.copy(alpha = 0.16f)
private val TrunkNeutral = Color.Black.copy(alpha = 0.22f)

internal const val TODAY_MARKER_HAS_INNER_RING = true
internal fun continuousRailEndpoints(height: Float, insetTop: Boolean, insetBottom: Boolean, inset: Float): Pair<Float, Float> =
    (if (insetTop) inset else 0f) to (if (insetBottom) height - inset else height)

@Composable
fun TimelineGraphColumn(
    day: TimelineDayWithEntries,
    trunkColor: Color?,
    canvasBackground: Color,
    insetTop: Boolean = false,
    insetBottom: Boolean = false,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier) {
        val unitPx = LANE_UNIT.toPx()
        val trunkX = TRUNK_X_UNITS * unitPx
        val h = size.height
        val strokeWidth = 3.dp.toPx()
        val outerInset = 18.dp.toPx()
        val (railTop, railBottom) = continuousRailEndpoints(h, insetTop, insetBottom, outerInset)

        if (trunkColor != null) {
            drawLine(
                trunkColor.copy(alpha = 0.78f),
                Offset(trunkX, railTop),
                Offset(trunkX, railBottom),
                strokeWidth = strokeWidth,
                cap = StrokeCap.Round,
            )
        } else {
            drawLine(
                GapDash,
                Offset(trunkX, railTop),
                Offset(trunkX, railBottom),
                strokeWidth = strokeWidth,
                cap = StrokeCap.Round,
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 8f)),
            )
        }

        day.branches.forEach { branch ->
            val x = laneXUnits(branch.laneIndex) * unitPx
            val path = Path()
            when (branch.position) {
                BranchPosition.START -> {
                    path.moveTo(trunkX, railTop)
                    path.cubicTo(trunkX, h / 2, x, h / 2, x, railBottom)
                }
                BranchPosition.END -> {
                    path.moveTo(x, railTop)
                    path.cubicTo(x, h / 2, trunkX, h / 2, trunkX, railBottom)
                }
                BranchPosition.THROUGH -> {
                    path.moveTo(x, railTop)
                    path.lineTo(x, railBottom)
                }
            }
            drawPath(path, color = entryTypeColor(branch.entryType), style = Stroke(width = strokeWidth, cap = StrokeCap.Round))
        }

        // Draw the current-day halo before entry nodes so it can never cover
        // a same-position itinerary marker.
        if (day.day.isToday) {
            val center = Offset(trunkX, h / 2f)
            drawCircle(TrailsColors.GoldLight.copy(alpha = 0.38f), radius = 12.dp.toPx(), center = center)
            drawCircle(canvasBackground, radius = 8.dp.toPx(), center = center)
            drawCircle(TrailsColors.Gold, radius = 7.dp.toPx(), center = center)
            drawCircle(canvasBackground, radius = 3.dp.toPx(), center = center)
        }

        // A Stay's own through-day renders no text at all in the content
        // column (TimelineScreen.kt's DayRow) -- excluded here too, or
        // every later line's dot would drift from its own text line.
        val visibleLines = day.lines.filterNot { it.entryType == "STAY" && !it.isStart && !it.isEnd }
        val lineCount = visibleLines.size.coerceAtLeast(1)
        val slotHeight = h / lineCount
        visibleLines.forEachIndexed { index, line ->
            if (line.isStart && line.isEnd) {
                val cy = slotHeight * index + slotHeight / 2
                drawCircle(canvasBackground, radius = 6.dp.toPx(), center = Offset(trunkX, cy))
                drawCircle(entryTypeColor(line.entryType), radius = 5.dp.toPx(), center = Offset(trunkX, cy))
            }
        }
    }
}
