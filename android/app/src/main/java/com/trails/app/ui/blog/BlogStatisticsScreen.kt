package com.trails.app.ui.blog

import android.text.format.DateFormat
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.trails.app.R
import com.trails.app.network.dto.BlogPostStatisticsDto
import com.trails.app.network.dto.TripBlogStatisticsDto
import com.trails.app.ui.components.PullToRefreshScreen
import com.trails.app.ui.components.TrailsCard
import com.trails.app.ui.theme.TrailsColors
import java.text.NumberFormat
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun BlogStatisticsScreen(padding: PaddingValues, viewModel: BlogStatisticsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsState()
    val data = state.data
    if (data == null) {
        Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
            if (state.failed) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(stringResource(R.string.blog_views_unavailable))
                    TextButton(onClick = viewModel::refresh) { Text(stringResource(R.string.blog_views_retry)) }
                }
            } else {
                CircularProgressIndicator()
            }
        }
        return
    }

    PullToRefreshScreen(isRefreshing = state.loading, onRefresh = viewModel::refresh, modifier = Modifier.fillMaxSize().padding(padding)) {
        BlogStatisticsContent(data, state.failed, viewModel::refresh)
    }
}

@Composable
private fun BlogStatisticsContent(
    data: TripBlogStatisticsDto,
    refreshFailed: Boolean,
    onRefresh: () -> Unit,
) {
    val locale = LocalConfiguration.current.locales[0]
    val number = remember(locale) { NumberFormat.getIntegerInstance(locale) }
    val date = remember(locale) { DateTimeFormatter.ofPattern(DateFormat.getBestDateTimePattern(locale, "MMMd"), locale) }
    var range by rememberSaveable { mutableIntStateOf(30) }
    var postId by rememberSaveable { mutableStateOf<String?>(null) }
    var showCountries by rememberSaveable { mutableStateOf(false) }
    val selected = data.posts.find { it.id == postId }
    val trend = remember(data, range, selected?.id) { data.trend(range, selected?.id) }
    val ranked = remember(data.posts) { data.posts.sortedByDescending { it.totalViews } }
    val highestTotal = ranked.firstOrNull()?.totalViews?.coerceAtLeast(1) ?: 1

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (refreshFailed) {
            item {
                TextButton(onClick = onRefresh) { Text(stringResource(R.string.blog_statistics_refresh_failed)) }
            }
        }
        item {
            TrailsCard(Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.blog_statistics_all_time), style = MaterialTheme.typography.labelLarge)
                Text(number.format(data.totalViews), style = MaterialTheme.typography.headlineLarge, color = TrailsColors.Brand)
            }
        }
        item {
            TrailsCard(Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.blog_statistics_trends), style = MaterialTheme.typography.titleMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(7, 30, 90).forEach { days ->
                        FilterChip(
                            selected = range == days,
                            onClick = { range = days },
                            label = { Text(stringResource(R.string.blog_statistics_range, days)) },
                        )
                    }
                }
                PostTrendPicker(data.posts, selected) { postId = it }
                if (trend.isEmpty()) {
                    Text(stringResource(R.string.blog_statistics_no_trend), color = TrailsColors.TextSoft)
                } else {
                    Text(stringResource(R.string.blog_views_total, number.format(trend.sumOf { it.views })))
                    DailyViewsChart(trend, number, date)
                }
                Text(stringResource(R.string.blog_statistics_history), style = MaterialTheme.typography.bodySmall, color = TrailsColors.TextSoft)
            }
        }
        if (data.countries.isNotEmpty()) {
            item {
                TrailsCard(Modifier.fillMaxWidth()) {
                    TextButton(onClick = { showCountries = !showCountries }) {
                        Text(stringResource(if (showCountries) R.string.blog_views_hide_countries else R.string.blog_views_show_countries))
                    }
                    if (showCountries) {
                        data.countries.forEach { country ->
                            val label = if (country.countryCode == "ZZ") stringResource(R.string.blog_views_unknown_country)
                            else Locale("", country.countryCode).getDisplayCountry(locale)
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Text(label, Modifier.weight(1f))
                                Text(number.format(country.views))
                            }
                        }
                    }
                }
            }
        }
        item {
            Text(stringResource(R.string.blog_statistics_by_post), style = MaterialTheme.typography.titleLarge)
            if (ranked.isEmpty()) Text(stringResource(R.string.blog_statistics_no_posts))
        }
        items(ranked, key = { it.id }) { post ->
            TrailsCard(Modifier.fillMaxWidth()) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(post.title, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                    Text(number.format(post.totalViews), color = TrailsColors.Brand)
                }
                Text(LocalDate.parse(post.date).format(date), style = MaterialTheme.typography.bodySmall, color = TrailsColors.TextSoft)
                Box(Modifier.fillMaxWidth().height(6.dp).background(TrailsColors.BrandMint, RoundedCornerShape(3.dp))) {
                    Box(
                        Modifier.fillMaxWidth((post.totalViews.toDouble() / highestTotal).toFloat())
                            .height(6.dp).background(TrailsColors.Brand, RoundedCornerShape(3.dp)),
                    )
                }
            }
        }
    }
}

@Composable
private fun PostTrendPicker(
    posts: List<BlogPostStatisticsDto>,
    selected: BlogPostStatisticsDto?,
    onSelection: (String?) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val all = stringResource(R.string.blog_statistics_all_posts)
    Box {
        TextButton(onClick = { expanded = true }, enabled = posts.isNotEmpty()) {
            Text(stringResource(R.string.blog_statistics_selected, selected?.title ?: all))
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(text = { Text(all) }, onClick = { onSelection(null); expanded = false })
            posts.forEach { post ->
                DropdownMenuItem(text = { Text(post.title) }, onClick = { onSelection(post.id); expanded = false })
            }
        }
    }
}

@Composable
private fun DailyViewsChart(days: List<DailyBlogViews>, number: NumberFormat, date: DateTimeFormatter) {
    val peak = days.maxByOrNull { it.views } ?: return
    val maximum = peak.views.coerceAtLeast(1)
    val caption = stringResource(R.string.blog_statistics_peak, peak.date.format(date), number.format(peak.views))
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Column(Modifier.height(148.dp), verticalArrangement = Arrangement.SpaceBetween) {
            Text(number.format(maximum), style = MaterialTheme.typography.labelSmall)
            Text("0", style = MaterialTheme.typography.labelSmall)
        }
        Column(Modifier.weight(1f)) {
            Canvas(Modifier.fillMaxWidth().height(148.dp).semantics { contentDescription = caption }) {
                val inset = 4.dp.toPx()
                val bottom = size.height - inset
                val width = (size.width - inset * 2).coerceAtLeast(0f)
                val height = (bottom - inset).coerceAtLeast(0f)
                for (index in 0..2) {
                    val y = inset + height * index / 2
                    drawLine(TrailsColors.BrandMint, Offset(0f, y), Offset(size.width, y))
                }
                val points = days.mapIndexed { index, day ->
                    val x = if (days.size == 1) size.width / 2 else inset + width * index / days.lastIndex
                    Offset(x, bottom - height * (day.views.toDouble() / maximum).toFloat())
                }
                val line = Path().apply {
                    moveTo(points.first().x, points.first().y)
                    points.drop(1).forEach { lineTo(it.x, it.y) }
                }
                drawPath(line, TrailsColors.Brand, style = Stroke(2.dp.toPx()))
                if (points.size <= 7) points.forEach { drawCircle(TrailsColors.Brand, 3.dp.toPx(), it) }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(days.first().date.format(date), style = MaterialTheme.typography.labelSmall)
                if (days.size > 1) Text(days.last().date.format(date), style = MaterialTheme.typography.labelSmall)
            }
        }
    }
    Text(caption, style = MaterialTheme.typography.bodySmall, color = TrailsColors.TextSoft)
}
