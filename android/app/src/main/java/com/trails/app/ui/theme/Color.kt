package com.trails.app.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Ported 1:1 from /workspace/trails/app/globals.css's `:root` custom
 * properties -- the web app's actual design tokens, not generic Material3
 * defaults. Keep this in sync if globals.css's palette ever changes.
 */
object TrailsColors {
    // Canvas & surfaces
    val Canvas = Color(0xFFF2F0EB)
    val CanvasAlt = Color(0xFFEDEBE9)
    val Surface = Color(0xFFFFFFFF)
    val SurfaceCool = Color(0xFFF9F9F9)

    // Tiered brand green system -- each mapped to one surface role
    val Brand = Color(0xFF006241) // headings, primary brand signal
    val BrandAccent = Color(0xFF00754A) // primary CTA fill
    val BrandDeep = Color(0xFF1E3932) // dark bands, nav-on-dark
    val BrandUplift = Color(0xFF2B5148) // decorative / secondary dark accent
    val BrandMint = Color(0xFFD4E9E2) // valid-state tint, light wash

    // Reserved ceremonial accent -- Active Trip / current-position marker only
    val Gold = Color(0xFFCBA258)
    val GoldLight = Color(0xFFDFC49D)
    val GoldLightest = Color(0xFFFAF6EE)

    // Text
    val Text = Color(0xDE000000) // rgba(0,0,0,0.87)
    val TextSoft = Color(0x94000000) // rgba(0,0,0,0.58)
    val TextOnDark = Color(0xFFFFFFFF)
    val TextOnDarkSoft = Color(0xB3FFFFFF) // rgba(255,255,255,0.7)

    // Semantic
    val Danger = Color(0xFFC82014)
    val DangerTint = Color(0x0FC82014) // hsl(4 82% 43% / 6%) == danger at 6% alpha

    // Shared low-alpha lines/borders used throughout globals.css
    val InputBorder = Color(0xFFD6DBDE)
    val HairlineOnLight = Color(0x1F000000) // rgba(0,0,0,0.12)-ish dividers
}
