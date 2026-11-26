package com.trails.app.update

import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class UpdateViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    @Test
    fun manualCheckCanReopenADismissedUpdate() = runTest(dispatcher) {
        val checker = mockk<UpdateChecker>()
        val update = UpdateInfo("0.61.0", "", "https://example.com/trails.apk")
        coEvery { checker.check() } returns UpdateCheckResult.Available(update)
        val viewModel = UpdateViewModel(checker)
        runCurrent()
        assertEquals(update, viewModel.uiState.value.available)

        viewModel.dismiss()
        assertNull(viewModel.uiState.value.available)
        viewModel.checkForUpdates()
        viewModel.checkForUpdates()
        assertEquals(UpdateCheckStatus.Checking, viewModel.uiState.value.checkStatus)
        runCurrent()

        assertEquals(update, viewModel.uiState.value.available)
        coVerify(exactly = 2) { checker.check() }
    }

    @Test
    fun manualCheckDistinguishesAFailedCheckFromAnUpToDateApp() = runTest(dispatcher) {
        val checker = mockk<UpdateChecker>()
        coEvery { checker.check() } returnsMany listOf(
            UpdateCheckResult.Failed,
            UpdateCheckResult.Failed,
            UpdateCheckResult.UpToDate,
        )
        val viewModel = UpdateViewModel(checker)
        runCurrent()
        assertEquals(UpdateCheckStatus.Idle, viewModel.uiState.value.checkStatus)

        viewModel.checkForUpdates()
        runCurrent()
        assertEquals(UpdateCheckStatus.Failed, viewModel.uiState.value.checkStatus)

        viewModel.checkForUpdates()
        runCurrent()
        assertEquals(UpdateCheckStatus.UpToDate, viewModel.uiState.value.checkStatus)
    }
}
