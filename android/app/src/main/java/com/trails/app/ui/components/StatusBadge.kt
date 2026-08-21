package com.trails.app.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsShapes

/** Mirrors globals.css's `.badge`/`.badge-upcoming`/`.badge-active`/`.badge-completed`. */
@Composable
fun TripStatusBadge(status: String) {
    val (background, contentColor, borderColor) = when (status) {
        "UPCOMING" -> Triple(TrailsColors.BrandMint, TrailsColors.BrandDeep, null)
        "ACTIVE" -> Triple(TrailsColors.GoldLightest, TrailsColors.Gold, TrailsColors.Gold)
        "COMPLETED" -> Triple(TrailsColors.SurfaceCool, TrailsColors.TextSoft, null)
        else -> Triple(TrailsColors.SurfaceCool, TrailsColors.TextSoft, null)
    }
    Surface(
        color = background,
        contentColor = contentColor,
        shape = TrailsShapes.Pill,
        border = borderColor?.let { BorderStroke(1.dp, it) },
    ) {
        Text(
            text = status,
            style = LocalTextStyle.current.copy(
                fontSize = MaterialTheme.typography.labelMedium.fontSize,
                fontWeight = MaterialTheme.typography.labelMedium.fontWeight,
                letterSpacing = MaterialTheme.typography.labelMedium.letterSpacing,
                fontFamily = MaterialTheme.typography.labelMedium.fontFamily,
            ),
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
        )
    }
}
