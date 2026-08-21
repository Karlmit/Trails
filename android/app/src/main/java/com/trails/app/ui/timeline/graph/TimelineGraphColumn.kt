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

@Composable
fun TimelineGraphColumn(
    day: TimelineDayWithEntries,
    trunkColor: Color?,
    canvasBackground: Color,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier) {
        val unitPx = LANE_UNIT.toPx()
        val trunkX = TRUNK_X_UNITS * unitPx
        val h = size.height
        val strokeWidth = 3.dp.toPx()

        if (trunkColor != null) {
            drawLine(trunkColor, Offset(trunkX, 0f), Offset(trunkX, h), strokeWidth = strokeWidth, cap = StrokeCap.Round)
        } else {
            drawLine(
                GapDash,
                Offset(trunkX, 0f),
                Offset(trunkX, h),
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
                    path.moveTo(trunkX, 0f)
                    path.cubicTo(trunkX, h / 2, x, h / 2, x, h)
                }
                BranchPosition.END -> {
                    path.moveTo(x, 0f)
                    path.cubicTo(x, h / 2, trunkX, h / 2, trunkX, h)
                }
                BranchPosition.THROUGH -> {
                    path.moveTo(x, 0f)
                    path.lineTo(x, h)
                }
            }
            drawPath(path, color = entryTypeColor(branch.entryType), style = Stroke(width = strokeWidth, cap = StrokeCap.Round))
        }

        val lineCount = day.lines.size.coerceAtLeast(1)
        val slotHeight = h / lineCount
        day.lines.forEachIndexed { index, line ->
            if (line.isStart && line.isEnd) {
                val cy = slotHeight * index + slotHeight / 2
                drawCircle(canvasBackground, radius = 6.dp.toPx(), center = Offset(trunkX, cy))
                drawCircle(entryTypeColor(line.entryType), radius = 5.dp.toPx(), center = Offset(trunkX, cy))
            }
        }
    }
}
