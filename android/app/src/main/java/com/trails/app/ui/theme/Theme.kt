package com.trails.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val TrailsColorScheme = lightColorScheme(
    primary = TrailsColors.BrandAccent,
    onPrimary = TrailsColors.TextOnDark,
    secondary = TrailsColors.Brand,
    onSecondary = TrailsColors.TextOnDark,
    tertiary = TrailsColors.Gold,
    onTertiary = TrailsColors.BrandDeep,
    background = TrailsColors.Canvas,
    onBackground = TrailsColors.Text,
    surface = TrailsColors.Surface,
    onSurface = TrailsColors.Text,
    surfaceVariant = TrailsColors.SurfaceCool,
    onSurfaceVariant = TrailsColors.TextSoft,
    error = TrailsColors.Danger,
    errorContainer = TrailsColors.DangerTint,
    onError = TrailsColors.Danger,
    onErrorContainer = TrailsColors.Danger,
    outline = TrailsColors.InputBorder,
)

@Composable
fun TrailsTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = TrailsColorScheme,
        typography = TrailsTypography,
        content = content,
    )
}
