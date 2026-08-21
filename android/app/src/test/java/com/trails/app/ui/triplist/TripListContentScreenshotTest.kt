package com.trails.app.ui.triplist

import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import com.trails.app.data.entity.TripEntity
import com.trails.app.ui.theme.TrailsTheme
import org.junit.Ignore
import org.junit.Rule
import org.junit.Test

/**
 * Renders TripListContent to a PNG on the JVM (LayoutLib, no
 * device/emulator) -- this project's stand-in for a Playwright screenshot
 * check, used to visually verify a screen without needing a physical phone.
 * First run: `./gradlew :app:recordPaparazziDebug` to write the golden image
 * under app/src/test/snapshots/. Subsequent runs:
 * `./gradlew :app:verifyPaparazziDebug` fails the build on any pixel diff.
 *
 * Currently @Ignore'd: Paparazzi 1.3.5's bundled LayoutLib framework stubs
 * don't yet implement a StaticLayout.Builder API that this Compose UI
 * version's text layer calls (NoSuchMethodError on
 * setUseBoundsForWidth) -- a real Paparazzi/Compose version-compatibility
 * gap, not a bug in this test. Tried pairing with several older Compose BOMs
 * without success; revisit once a Paparazzi release catches up to a Compose
 * UI version this new. The Robolectric data-layer test
 * (TripRepositoryOfflineReadTest) and the actual debug APK build both work
 * and are the real verification for this phase. Re-confirmed still broken
 * after the visual-design pass (same NoSuchMethodError) -- wrapped in
 * TrailsTheme now instead of plain MaterialTheme so it's ready to record
 * the real look the moment this becomes unblocked.
 */
@Ignore("Paparazzi 1.3.5 / this Compose UI version are incompatible -- see class doc")
class TripListContentScreenshotTest {

    @get:Rule
    val paparazzi = Paparazzi(deviceConfig = DeviceConfig.PIXEL_6)

    private val sampleTrips = listOf(
        TripEntity(
            id = "11111111-1111-4111-8111-111111111111",
            name = "Thailand",
            destination = "Bangkok, Chiang Mai",
            startDate = "2026-08-01",
            endDate = "2026-08-20",
            timezone = "Asia/Bangkok",
            description = null,
            coverImage = null,
            visibility = "PRIVATE",
            status = "UPCOMING",
            durationDays = 20,
            createdAt = "2026-07-01T00:00:00.000Z",
            updatedAt = "2026-07-01T00:00:00.000Z",
        ),
        TripEntity(
            id = "22222222-2222-4222-8222-222222222222",
            name = "Iceland Ring Road",
            destination = null,
            startDate = "2025-06-10",
            endDate = "2025-06-18",
            timezone = "Atlantic/Reykjavik",
            description = null,
            coverImage = null,
            visibility = "PRIVATE",
            status = "COMPLETED",
            durationDays = 9,
            createdAt = "2025-05-01T00:00:00.000Z",
            updatedAt = "2025-05-01T00:00:00.000Z",
        ),
    )

    @Test
    fun `trip list with cached trips`() {
        paparazzi.snapshot {
            TrailsTheme {
                TripListContent(
                    state = TripListUiState(trips = sampleTrips, isSyncing = false),
                    onOpenTrip = {},
                )
            }
        }
    }

    @Test
    fun `empty state while offline with nothing cached yet`() {
        paparazzi.snapshot {
            TrailsTheme {
                TripListContent(
                    state = TripListUiState(trips = emptyList(), isSyncing = false, syncError = "Could not reach the server"),
                    onOpenTrip = {},
                )
            }
        }
    }
}
