package com.trails.app.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsShapes

enum class PillButtonVariant { Primary, Outline, DarkOutline, Danger }

/**
 * Mirrors globals.css's `.btn` family exactly: full-pill radius, 44dp min
 * touch target, and the same scale(0.95) active-press feel (`.btn:active`).
 */
@Composable
fun PillButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    variant: PillButtonVariant = PillButtonVariant.Primary,
    enabled: Boolean = true,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.95f else 1f, label = "pillButtonPress")
    val shapeModifier = modifier.scale(scale).defaultMinSize(minHeight = 44.dp)

    when (variant) {
        PillButtonVariant.Primary -> Button(
            onClick = onClick,
            modifier = shapeModifier,
            enabled = enabled,
            shape = TrailsShapes.Pill,
            colors = ButtonDefaults.buttonColors(
                containerColor = TrailsColors.BrandAccent,
                contentColor = TrailsColors.TextOnDark,
            ),
            contentPadding = PaddingValues(horizontal = 26.dp, vertical = 14.dp),
            interactionSource = interactionSource,
        ) { Text(text) }

        PillButtonVariant.Outline -> outlinedPillButton(
            text, onClick, shapeModifier, enabled, TrailsColors.BrandAccent, interactionSource,
        )

        PillButtonVariant.DarkOutline -> outlinedPillButton(
            text, onClick, shapeModifier, enabled, TrailsColors.Text, interactionSource,
            borderColor = Color(0x66000000),
        )

        PillButtonVariant.Danger -> outlinedPillButton(
            text, onClick, shapeModifier, enabled, TrailsColors.Danger, interactionSource,
        )
    }
}

@Composable
private fun outlinedPillButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier,
    enabled: Boolean,
    contentColor: Color,
    interactionSource: MutableInteractionSource,
    borderColor: Color = contentColor,
) {
    OutlinedButton(
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        shape = TrailsShapes.Pill,
        colors = ButtonDefaults.outlinedButtonColors(contentColor = contentColor),
        border = BorderStroke(1.dp, borderColor),
        contentPadding = PaddingValues(horizontal = 26.dp, vertical = 14.dp),
        interactionSource = interactionSource,
    ) { Text(text) }
}
