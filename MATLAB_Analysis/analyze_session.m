function analyze_session() % %
    -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -%
    BEAM BALL TELEMETRY ANALYSIS SUITE %
    -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --%
    Purpose : Loads latest Simulink session data,
    computes biomechanical metrics, % and generates publication -
                                        quality visualizations.%
                                            Inputs
    : 'sim_session_data'(Structure with time from Simulink) %
      Outputs : Figures 1 - 3,
    Console Report %
        Author
    : Antigravity(on behalf of User) %
      -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --

                                                                                                                  clc;
close all;

% % 1. Load Latest Session %
    Find the most recent.mat file in current directory files =
    dir('Experiment_Log_*.mat');
if isempty (files)
  error('No experiment logs found. Run Simulink model first.');
end[~, idx] = max([files.datenum]);
latest_file = files(idx).name;
fprintf('Loading Session: %s\n', latest_file);
load(latest_file, 'sim_session_data');

% Unpack Structure %
    Assumes bus structure
    : [ Score(1), Health(1), BallX(1), BallY(1), Ly(1), Ry(1), State(1) ] %
      Adjust indices based on your specific Bus Creator ordering time =
    sim_session_data.time;
raw_data = sim_session_data.signals.values;

% Signals(Modify indices to match your Simulink Bus) Score = raw_data( :, 1);
Health = raw_data( :, 2);
BallX = raw_data( :, 3);
BallY = raw_data( :, 4);
Ly = raw_data( :, 5);
Ry = raw_data( :, 6);
State = raw_data( :, 7);

    %% 2. Data Filtering & Segmentation
    % Filter: Keep only 'Playing' state (1) and transient events (10,11,12)
    % Exclude 'Wait' (0) and 'End' (2) for statistical analysis
    play_mask = (State == 1) | (State >= 10);

    t_play = time(play_mask);
    bx = BallX(play_mask);
    by = BallY(play_mask);
    ly = Ly(play_mask);
    ry = Ry(play_mask);
    st = State(play_mask);

    % Calculate derived beam angle (theta)
    % Assuming beam length L_beam (approx in pixels for visualization)
    L_beam = 800;
    theta = atand((ry - ly) / L_beam);
    % Degrees

        % % 3. Metric Extraction

        % A.Recovery Time(tau_rec) % Compute Velocity magnitude dt =
        mean(diff(t_play));
    vx = [0; diff(bx) / dt];
    vy = [0; diff(by) / dt];
    v_mag = sqrt(vx.^ 2 + vy.^ 2);

    % Smooth velocity for robustness
    v_smooth = smoothdata(v_mag, 'movmean', 10);

    % Thresholds(px / s) V_HIGH = 400;
    % Perturbation onset(user actively fighting error) V_LOW = 40;
    % Settling(equilibrium reached) MIN_SETTLE_TIME = 0.5;
    (seconds)

        % Find Perturbation Events(Rising Edge of High Velocity)
              is_high = v_smooth > V_HIGH;
    perturbation_starts = find(diff([0; is_high]) == 1);

    recovery_times = [];

    for
      i = 1 : length(perturbation_starts) idx_start = perturbation_starts(i);
    t_start = t_play(idx_start);

        % Look forward for settling
        % Find first time after t_start where velocity stays < V_LOW for MIN_SETTLE_TIME
        % Simplified: Find first window of length M where max(v) < V_LOW
        
        % Start searching from the peak of this perturbation
        % (Find when it drops triggers below V_LOW)
        future_mask = (1:length(v_smooth))' > idx_start;
        is_low = v_smooth < V_LOW;

        % Candidate settling points candidates = find(future_mask & is_low);

        if ~isempty(candidates)
            % Check distinct settling windows
            for j = 1:length(candidates)
                idx_settle = candidates(j);
                % Check if it stays low for next 0.5s (approx 30 samples at 60Hz)
                n_check = round(MIN_SETTLE_TIME / dt);
                if (idx_settle + n_check)
                  <= length(v_smooth) window_v =
                      v_smooth(idx_settle : idx_settle + n_check);
                if all (window_v < V_LOW)
                  t_end = t_play(idx_settle);
                tau = t_end - t_start;
                if tau
                  > 0.1 % Filter noise recovery_times = [recovery_times; tau];
                end break; % Found the recovery for this perturbation
                    end
                end
            end
        end
    end
    
    avg_recovery = mean(recovery_times);
                if isnan (avg_recovery)
                  , avg_recovery = 0;
                end

                    % Detect events falls = find(st == 10);
                fprintf('\n--- SESSION METRICS ---\n');
                fprintf('Total Duration:  %.2f s\n', t_play(end) - t_play(1));
                fprintf('Fall Count:      %d\n', length(falls));
                fprintf('Mean Recovery:   %.3f s (N=%d events)\n', avg_recovery,
                        length(recovery_times));

    %% 4. Visualization
    
    % Set Default Plot Style for Publication
    set(0, 'DefaultAxesFontSize', 12);
    set(0, 'DefaultAxesFontName', 'Arial');
    set(0, 'DefaultLineLineWidth', 1.5);

    % FIG 1 : The Performance Landscape(Trajectory Heatmap)
                  figure('Color', 'w', 'Name', 'Fig 1: Kinematics Heatmap',
                         'Position', [100 100 800 500]);

    % Compute 2D Histogram nBins = 50;
    x_edges = linspace(0, 1280, nBins);
    y_edges = linspace(0, 720, nBins);
    h = histogram2(bx, by, x_edges, y_edges, 'DisplayStyle', 'tile',
                   'ShowEmptyBins', 'on');
    colormap(jet);
    cb = colorbar;
    cb.Label.String = 'Residence Time (Samples)';

    hold on;
    % Overlay Fall Events if ~isempty(falls) %
        Map falls back to full time index then to play index %
        (Simplified : Plotting all falls from full dataset if needed,
         here using masked) %
        For exactness,
        we find where st == 10 fall_idx = find(st == 10);
    plot(bx(fall_idx), by(fall_idx), 'kx', 'MarkerSize', 12, 'LineWidth', 2,
         'DisplayName', 'Fall Events');
    end

        % Formatting axis([0 1280 0 720]);
    set(gca, 'YDir', 'reverse');
    % Screen coordinates xlabel('Ball X (px)');
    ylabel('Ball Y (px)');
    title('Spatial Efficiency & "Dead Zones" Analysis');
    legend('Location', 'northeast');
    grid on;

    % FIG 2 : The Control Signature(Coordination &Phase)
                  figure('Color', 'w', 'Name', 'Fig 2: Control Signature',
                         'Position', [150 150 1000 400]);

    % Subplot 1 : Coordination Plane(Ly vs Ry) subplot(1, 2, 1);
    scatter(ly, ry, 10, v_smooth, 'filled');
    colormap(parula);
    c = colorbar;
    c.Label.String = 'Ball Velocity (px/s)';
    hold on;

    % Reference Lines plot([0 720], [0 720], 'k--', 'LineWidth', 1);
    % Pure Heave(Synergy) plot([0 720], [720 0], 'r--', 'LineWidth', 1);
    % Pure Roll(Strategy)

    axis square;
    axis([0 720 0 720]);
    xlabel('Left Stiffness Output (Ly)');
    ylabel('Right Stiffness Output (Ry)');
    title({'Coordination Plane', '(\it{Diagonal=Heave, Anti=Roll})'});
    text(100, 600, 'Roll Dominant', 'Color', 'r', 'FontWeight', 'bold');
    text(500, 600, 'Heave Dominant', 'Color', 'k', 'FontWeight', 'bold');

    % Subplot 2 : Phase Portrait(Theta vs Theta_dot) subplot(1, 2, 2);

    % Calculate Angular Velocity theta_dot = [0; diff(theta) / dt];

    % Density Scatter for Phase Plot
    scatter(theta, theta_dot, 5, 'k', 'filled', 'MarkerFaceAlpha', 0.1);

    hold on;
    xline(3, 'r--', 'Unstable Bound');
    xline(-3, 'r--');

    xlabel('Beam Angle \theta (deg)');
    ylabel('Angular Rate \dot{\theta} (deg/s)');
    title('Stability Phase Portrait');
    grid on;
    axis([-15 15 - 100 100]);
    % Zoom in on central behavior

        end
