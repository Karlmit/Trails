package com.trails.app.ui.blog

import java.io.IOException
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

@Singleton
class OpenAiProofreader internal constructor(private val calls: Call.Factory) {
    @Inject constructor() : this(
        OkHttpClient.Builder()
            .followRedirects(false)
            .retryOnConnectionFailure(false)
            .callTimeout(45, TimeUnit.SECONDS)
            .build(),
    )

    internal suspend fun correct(source: String, apiKey: String): OpenAiProofreadingResult =
        suspendCancellableCoroutine { continuation ->
            val request = Request.Builder()
                .url("https://api.openai.com/v1/responses")
                .header("Authorization", "Bearer $apiKey")
                .post(proofreadingRequest(source).toString().toRequestBody("application/json".toMediaType()))
                .build()
            val call = calls.newCall(request)
            continuation.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    continuation.resume(OpenAiProofreadingResult.Error(ProofreadingStatus.CloudConnectionFailed))
                }

                override fun onResponse(call: Call, response: Response) {
                    val result = response.use {
                        try {
                            if (!it.isSuccessful) openAiFailure(it.code) else {
                                val body = it.peekBody(MAX_RESPONSE_BYTES + 1)
                                if (body.contentLength() > MAX_RESPONSE_BYTES) invalidResponse
                                else parseOpenAiProofreadingResponse(body.string())
                            }
                        } catch (_: IOException) {
                            OpenAiProofreadingResult.Error(ProofreadingStatus.CloudConnectionFailed)
                        }
                    }
                    continuation.resume(result)
                }
            })
        }
}

internal sealed interface OpenAiProofreadingResult {
    data class Correction(val text: String) : OpenAiProofreadingResult
    data class Error(val status: ProofreadingStatus) : OpenAiProofreadingResult
}

private const val MAX_RESPONSE_BYTES = 65_536L
private val invalidResponse = OpenAiProofreadingResult.Error(ProofreadingStatus.InvalidSuggestion)

internal fun proofreadingRequest(source: String) = buildJsonObject {
    put("model", "gpt-4.1-mini")
    put("instructions", proofreadingInstructions())
    put("input", source)
    put("store", false)
    put("temperature", 0.1)
    put("max_output_tokens", 1_536)
    putJsonObject("text") {
        putJsonObject("format") {
            put("type", "json_schema")
            put("name", "proofread_paragraph")
            put("strict", true)
            putJsonObject("schema") {
                put("type", "object")
                putJsonObject("properties") {
                    putJsonObject("text") { put("type", "string") }
                }
                putJsonArray("required") { add(JsonPrimitive("text")) }
                put("additionalProperties", false)
            }
        }
    }
}

private fun openAiFailure(code: Int) = OpenAiProofreadingResult.Error(
    when (code) {
        401, 403 -> ProofreadingStatus.CloudKeyRejected
        429 -> ProofreadingStatus.CloudRateLimited
        else -> ProofreadingStatus.CloudFailed
    },
)

internal fun parseOpenAiProofreadingResponse(body: String): OpenAiProofreadingResult {
    val response = runCatching { Json.parseToJsonElement(body) as? JsonObject }.getOrNull()
        ?: return invalidResponse
    if (response.string("status") == "incomplete" &&
        (response["incomplete_details"] as? JsonObject)?.string("reason") == "max_output_tokens"
    ) {
        return OpenAiProofreadingResult.Error(ProofreadingStatus.TooLong)
    }
    if (response.string("status") != "completed") return invalidResponse
    val output = response["output"] as? JsonArray ?: return invalidResponse
    val message = output.filterIsInstance<JsonObject>().singleOrNull {
        it.string("type") == "message" && it.string("role") == "assistant"
    } ?: return invalidResponse
    val content = (message["content"] as? JsonArray)?.singleOrNull() as? JsonObject
        ?: return invalidResponse
    if (content.string("type") != "output_text") return invalidResponse
    return parseProofreadingCorrection(content.string("text"))?.let(OpenAiProofreadingResult::Correction)
        ?: invalidResponse
}

private fun JsonObject.string(name: String): String? = (get(name) as? JsonPrimitive)?.contentOrNull
