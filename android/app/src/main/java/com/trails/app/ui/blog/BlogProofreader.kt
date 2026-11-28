package com.trails.app.ui.blog

import com.google.mlkit.genai.common.DownloadStatus
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.prompt.Candidate
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.GenerativeModel
import com.google.mlkit.genai.prompt.TextPart
import com.google.mlkit.genai.prompt.generateContentRequest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import javax.inject.Inject

private const val MAX_OUTPUT_TOKENS = 1_536
private val lineBreak = Regex("\\r\\n|[\\r\\n\\u2028\\u2029]")

class BlogProofreader internal constructor(
    private val preferences: ProofreadingPreferences?,
    private val openAi: OpenAiProofreader?,
    private val createModel: () -> GenerativeModel,
) {
    @Inject constructor(preferences: ProofreadingPreferences, openAi: OpenAiProofreader) :
        this(preferences, openAi, { Generation.getClient() })

    internal constructor(createModel: () -> GenerativeModel) : this(null, null, createModel)

    internal suspend fun proofread(
        runs: List<InlineRun>,
        download: Boolean,
        onStatus: (ProofreadingStatus) -> Unit,
    ): ProofreadingState {
        if (runs.sumOf { it.text.length } > MAX_PROOFREADING_INPUT_LENGTH) return ProofreadingStatus.TooLong
        val source = runs.joinToString("") { it.text }
        if (source.isBlank()) return ProofreadingStatus.NoChanges

        val settings = preferences
        if (settings != null && settings.useChatGpt) {
            val key = try {
                withContext(Dispatchers.IO) { settings.readApiKey() }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                return ProofreadingStatus.CloudKeyUnreadable
            } ?: return ProofreadingStatus.CloudKeyMissing
            onStatus(ProofreadingStatus.CloudGenerating)
            return when (val result = checkNotNull(openAi).correct(source, key)) {
                is OpenAiProofreadingResult.Error -> result.status
                is OpenAiProofreadingResult.Correction -> validatedSuggestion(runs, source, result.text)
            }
        }

        var downloading = false
        return try {
            val model = createModel()
            try {
                var status = model.checkStatus()
                if (status == FeatureStatus.DOWNLOADABLE && download) {
                    downloading = true
                    onStatus(ProofreadingStatus.Downloading)
                    val terminal = model.download().first {
                        it is DownloadStatus.DownloadCompleted || it is DownloadStatus.DownloadFailed
                    }
                    if (terminal is DownloadStatus.DownloadFailed) return ProofreadingStatus.DownloadFailed
                    downloading = false
                    status = model.checkStatus()
                }
                when (status) {
                    FeatureStatus.DOWNLOADABLE -> ProofreadingStatus.Downloadable
                    FeatureStatus.DOWNLOADING -> ProofreadingStatus.DownloadInProgress
                    FeatureStatus.AVAILABLE -> {
                        onStatus(ProofreadingStatus.Generating)
                        generateCorrection(model, source, runs)
                    }
                    else -> ProofreadingStatus.Unavailable
                }
            } finally {
                model.close()
            }
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (_: Exception) {
            currentCoroutineContext().ensureActive()
            // SDK errors can include request details. Keep the error local and generic.
            if (downloading) ProofreadingStatus.DownloadFailed else ProofreadingStatus.Failed
        }
    }

    private suspend fun generateCorrection(
        model: GenerativeModel,
        source: String,
        runs: List<InlineRun>,
    ): ProofreadingState {
        val prompt = TextPart(proofreadingPrompt(source))
        val inputTokens = model.countTokens(generateContentRequest(prompt) {}).totalTokens
        val sourceTokens = model.countTokens(generateContentRequest(TextPart(source)) {}).totalTokens
        val outputTokens = (sourceTokens + 128).coerceAtMost(MAX_OUTPUT_TOKENS)
        if (inputTokens + outputTokens > model.getTokenLimit()) return ProofreadingStatus.TooLong
        val request = generateContentRequest(prompt) {
            temperature = 0.1f
            maxOutputTokens = outputTokens
        }

        val candidate = model.generateContent(request).candidates.singleOrNull()
            ?: return ProofreadingStatus.InvalidSuggestion
        val finishReason = candidate.finishReason
        if (finishReason == Candidate.FinishReason.MAX_TOKENS) return ProofreadingStatus.TooLong
        if (finishReason != null && finishReason != Candidate.FinishReason.STOP) {
            return ProofreadingStatus.InvalidSuggestion
        }
        val correction = parseProofreadingCorrection(candidate.text)
            ?: return ProofreadingStatus.InvalidSuggestion
        return validatedSuggestion(runs, source, correction)
    }

    private suspend fun validatedSuggestion(
        runs: List<InlineRun>,
        source: String,
        correction: String,
    ): ProofreadingState {
        if (lineBreak.findAll(correction).count() != lineBreak.findAll(source).count()) {
            return ProofreadingStatus.InvalidSuggestion
        }
        if (correction == source) return ProofreadingStatus.NoChanges
        return withContext(Dispatchers.Default) { proofreadingSuggestion(runs, correction) }
    }
}
