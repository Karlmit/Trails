package com.trails.app.util

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import com.trails.app.R

/** lib/travel-mode.ts::mapsSearchUrl / entryMapsUrl -- a Maps *search* URL, not the entry's own stored locationMapLink, so it always works given just an address/name. */
fun mapsSearchUrl(address: String): String =
    "https://www.google.com/maps/search/?api=1&query=${java.net.URLEncoder.encode(address, "UTF-8")}"

fun entryMapsUrl(locationAddress: String?, locationName: String?): String? {
    val address = locationAddress?.takeIf { it.isNotBlank() } ?: locationName?.takeIf { it.isNotBlank() } ?: return null
    return mapsSearchUrl(address)
}

/** Opens any external http(s) URL (Maps search, an Entry's own website field, ...), never crashing if no app can handle it. */
fun openExternalUrl(context: Context, url: String) {
    try {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: ActivityNotFoundException) {
        Toast.makeText(context, context.getString(R.string.shell_no_app_for_link), Toast.LENGTH_SHORT).show()
    }
}
