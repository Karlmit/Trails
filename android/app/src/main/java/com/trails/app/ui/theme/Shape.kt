package com.trails.app.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.unit.dp

object TrailsShapes {
    val Hero = RoundedCornerShape(ClayMetrics.HeroRadius)
    val Card = RoundedCornerShape(ClayMetrics.CardRadius)
    val Nested = RoundedCornerShape(ClayMetrics.NestedRadius)
    val Compact = RoundedCornerShape(ClayMetrics.CompactRadius)
    val Pill = RoundedCornerShape(50)
    val Input = RoundedCornerShape(ClayMetrics.InputRadius)
    val Sheet = RoundedCornerShape(topStart = 32.dp, topEnd = 32.dp)
    val Floating = CircleShape
}

/** Public, testable geometry contracts shared by every screen family. */
object ClayMetrics {
    val HeroRadius = 32.dp
    val CardRadius = 24.dp
    val NestedRadius = 20.dp
    val CompactRadius = 16.dp
    val InputRadius = 18.dp
    val MinimumTouchTarget = 48.dp
    val DenseListElevation = 1.dp
}
