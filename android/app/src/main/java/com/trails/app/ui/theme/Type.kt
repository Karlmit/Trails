package com.trails.app.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.trails.app.R

// The web app self-hosts Inter (app/fonts/inter-{400,600,700}.woff2); this is
// the same family (variable TTF), instanced per weight via FontVariation
// rather than shipping three separate static files.
@OptIn(ExperimentalTextApi::class)
val InterFamily = FontFamily(
    Font(R.font.inter, FontWeight.Normal, variationSettings = FontVariation.Settings(FontVariation.weight(400))),
    Font(R.font.inter, FontWeight.SemiBold, variationSettings = FontVariation.Settings(FontVariation.weight(600))),
    Font(R.font.inter, FontWeight.Bold, variationSettings = FontVariation.Settings(FontVariation.weight(700))),
)

// globals.css: body { letter-spacing: var(--tracking-tight) /* -0.01em */ }
// -- applied em-relative (not a fixed sp value) so it scales with font size
// exactly like the CSS does, at every type scale below.
private val TightTracking = (-0.01).em

// globals.css's h1/h2 intentionally share size (1.5rem = 24sp per the
// 16px-root body) and differ only by weight + color (h1: 600/brand, h2:
// 400/text) -- color is applied at the call site, not baked in here, same
// split as the CSS.
val TrailsTypography = Typography(
    // h1 (weight 600) / h2 (weight 400, override at call site) share this.
    titleLarge = TextStyle(
        fontFamily = InterFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 24.sp,
        lineHeight = 1.3.em,
        letterSpacing = TightTracking,
    ),
    // h3: 1rem, weight 600.
    titleMedium = TextStyle(
        fontFamily = InterFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.sp,
        lineHeight = 1.3.em,
        letterSpacing = TightTracking,
    ),
    // Base body copy (16px root, line-height 1.5).
    bodyLarge = TextStyle(
        fontFamily = InterFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 1.5.em,
        letterSpacing = TightTracking,
    ),
    // .entry-chip / trip-card secondary line (~0.9rem).
    bodyMedium = TextStyle(
        fontFamily = InterFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 1.4.em,
        letterSpacing = TightTracking,
    ),
    // Small print (~0.85rem, trip-card date line).
    bodySmall = TextStyle(
        fontFamily = InterFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 1.4.em,
        letterSpacing = TightTracking,
    ),
    // .btn: 0.95rem, weight 600.
    labelLarge = TextStyle(
        fontFamily = InterFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp,
        letterSpacing = TightTracking,
    ),
    // .field label / .badge: ~0.8rem, weight 600/700, uppercase, WIDE
    // tracking (+0.05em) -- the one deliberate exception to TightTracking,
    // matching globals.css exactly (both rules set their own letter-spacing).
    labelMedium = TextStyle(
        fontFamily = InterFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 13.sp,
        letterSpacing = 0.05.em,
    ),
)
