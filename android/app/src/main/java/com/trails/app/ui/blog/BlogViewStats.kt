package com.trails.app.ui.blog

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.trails.app.R
import com.trails.app.ui.components.TrailsCard
import com.trails.app.ui.theme.TrailsColors
import java.text.NumberFormat
import java.util.Locale

@Composable
internal fun BlogViewStats(state: BlogStatsState, onRefresh: () -> Unit) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    val locale = LocalConfiguration.current.locales[0]
    val counts = remember(locale) { NumberFormat.getIntegerInstance(locale) }
    TrailsCard(modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)) {
        when (state) {
            BlogStatsState.Loading ->
                Text(stringResource(R.string.blog_views_loading), color = TrailsColors.TextSoft)
            BlogStatsState.Unavailable -> {
                Text(stringResource(R.string.blog_views_unavailable), color = TrailsColors.TextSoft)
                TextButton(onClick = onRefresh) { Text(stringResource(R.string.blog_views_retry)) }
            }
            is BlogStatsState.Ready -> {
                val stats = state.stats
                Text(
                    stringResource(R.string.blog_views_total, counts.format(stats.totalViews)),
                    style = MaterialTheme.typography.titleMedium,
                    color = TrailsColors.Brand,
                )
                if (stats.countries.isNotEmpty()) {
                    TextButton(onClick = { expanded = !expanded }) {
                        Text(stringResource(
                            if (expanded) R.string.blog_views_hide_countries else R.string.blog_views_show_countries,
                        ))
                    }
                    if (expanded) {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            stats.countries.forEach { country ->
                                val name = if (country.countryCode == "ZZ") {
                                    stringResource(R.string.blog_views_unknown_country)
                                } else {
                                    remember(locale, country.countryCode) {
                                        Locale("", country.countryCode).getDisplayCountry(locale)
                                    }
                                }
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                    Text(name, Modifier.weight(1f))
                                    Text(counts.format(country.views))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
