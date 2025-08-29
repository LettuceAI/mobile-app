import java.io.File
import org.apache.tools.ant.taskdefs.condition.Os
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.LogLevel
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction

open class BuildTask : DefaultTask() {
    @Input
    var rootDirRel: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null

    @TaskAction
    fun assemble() {
        // Try to find npm in common locations
        val possibleNpmPaths = listOf(
            "/home/megalith/.local/share/nvm/v22.17.0/bin/npm", // Current nvm path
            System.getenv("HOME") + "/.local/share/nvm/current/bin/npm", // Generic nvm current
            "npm" // System npm as fallback
        )
        
        var lastException: Exception? = null
        for (npmPath in possibleNpmPaths) {
            try {
                runTauriCli(npmPath)
                return // Success, exit early
            } catch (e: Exception) {
                lastException = e
                // Continue to next path
            }
        }
        
        // If we get here, all paths failed
        if (Os.isFamily(Os.FAMILY_WINDOWS)) {
            try {
                runTauriCli("npm.cmd")
            } catch (e: Exception) {
                throw lastException ?: e
            }
        } else {
            throw lastException ?: GradleException("Could not find npm executable")
        }
    }

    fun runTauriCli(executable: String) {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")
        val args = listOf("run", "--", "tauri", "android", "android-studio-script");

        project.exec {
            workingDir(File(project.projectDir, rootDirRel))
            executable(executable)
            args(args)
            if (project.logger.isEnabled(LogLevel.DEBUG)) {
                args("-vv")
            } else if (project.logger.isEnabled(LogLevel.INFO)) {
                args("-v")
            }
            if (release) {
                args("--release")
            }
            args(listOf("--target", target))
        }.assertNormalExitValue()
    }
}