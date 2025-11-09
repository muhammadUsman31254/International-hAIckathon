import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import Navigation from "@/components/Navigation";
import StatCard from "@/components/StatCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { 
  TreeDeciduous, 
  DollarSign, 
  BookOpen, 
  Briefcase,
  Cloud,
  Droplets,
  TrendingUp,
  Award,
  Trophy
} from "lucide-react";

const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    coursesCompleted: 0,
    coursesInProgress: 0,
    jobsCompleted: 0,
    jobsAvailable: 0,
    totalEarned: 0,
    monthlyEarned: 0,
    impactScore: 0,
    recentActivities: [] as any[],
  });

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      loadStats();
    }
  }, [user]);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
      return;
    }

    // If user is admin, redirect to admin portal
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (role) {
      navigate("/admin");
      return;
    }

    setUser(user);
    setLoading(false);
  };

  const loadStats = async () => {
    if (!user) return;

    try {
      // Get user profile for points
      const { data: profile } = await supabase
        .from("profiles")
        .select("points")
        .eq("id", user.id)
        .single();

      // Get course certificates (completed courses)
      const { data: courseCertificates } = await supabase
        .from("certificates")
        .select("course_id, issued_at")
        .eq("user_id", user.id);

      // Get module certificates count
      const { data: moduleCertificates } = await supabase
        .from("module_certificates")
        .select("id")
        .eq("user_id", user.id);

      // Get courses in progress (progress > 0 and < 100)
      const { data: progressData } = await supabase
        .from("course_progress")
        .select("course_id, progress_percentage")
        .eq("user_id", user.id)
        .gt("progress_percentage", 0)
        .lt("progress_percentage", 100);

      // Get completed jobs (verified/approved/completed status)
      const { data: completedJobs } = await supabase
        .from("micro_jobs")
        .select("id, payment_amount, payment_sent, created_at, title")
        .eq("user_id", user.id)
        .in("status", ["verified", "approved", "completed"]);

      // Get available jobs (approved status, not by this user)
      const { data: availableJobs } = await supabase
        .from("micro_jobs")
        .select("id")
        .eq("status", "approved")
        .neq("user_id", user.id);

      // Calculate total earned (sum of payment_amount where payment_sent is true)
      const totalEarned = completedJobs
        ?.filter(job => job.payment_sent)
        .reduce((sum, job) => sum + (job.payment_amount || 0), 0) || 0;

      // Calculate monthly earned (this month)
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthlyEarned = completedJobs
        ?.filter(job => {
          if (!job.payment_sent) return false;
          const jobDate = new Date(job.created_at);
          return jobDate >= startOfMonth;
        })
        .reduce((sum, job) => sum + (job.payment_amount || 0), 0) || 0;

      // Get recent activities
      const activities: any[] = [];
      
      // Add recent course completions
      if (courseCertificates) {
        courseCertificates.forEach(cert => {
          activities.push({
            id: `cert-${cert.course_id}`,
            type: "course",
            title: `Completed Course`,
            date: formatDate(cert.issued_at),
            dateRaw: cert.issued_at, // Keep raw date for sorting
            points: 100, // Default points for course completion
          });
        });
      }

      // Add recent job completions
      if (completedJobs) {
        completedJobs
          .filter(job => job.payment_sent)
          .forEach(job => {
            activities.push({
              id: `job-${job.id}`,
              type: "job",
              title: job.title || "Completed Job",
              date: formatDate(job.created_at),
              dateRaw: job.created_at, // Keep raw date for sorting
              earned: `$${job.payment_amount?.toFixed(0) || 0}`,
            });
          });
      }

      // Sort activities by date (most recent first) and take top 4
      activities.sort((a, b) => {
        const dateA = a.dateRaw ? new Date(a.dateRaw).getTime() : 0;
        const dateB = b.dateRaw ? new Date(b.dateRaw).getTime() : 0;
        return dateB - dateA; // Most recent first
      });

      setStats({
        coursesCompleted: courseCertificates?.length || 0,
        coursesInProgress: progressData?.length || 0,
        jobsCompleted: completedJobs?.length || 0,
        jobsAvailable: availableJobs?.length || 0,
        totalEarned,
        monthlyEarned,
        impactScore: profile?.points || 0,
        recentActivities: activities.slice(0, 4),
      });
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Unknown";
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "1 day ago";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    }
    const months = Math.floor(diffDays / 30);
    return `${months} month${months > 1 ? 's' : ''} ago`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="container mx-auto px-4 py-8">
          <p className="text-center text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const userName = user?.user_metadata?.full_name?.split(" ")[0] || "User";

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="container mx-auto px-4 py-8">
        {/* Welcome Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
            Welcome back, {userName}! 👋
          </h1>
          <p className="text-muted-foreground">
            Here's your impact on the environment and your progress
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            icon={BookOpen}
            label="Courses Completed"
            value={stats.coursesCompleted}
            subtitle={stats.coursesInProgress > 0 ? `${stats.coursesInProgress} in progress` : "Start learning"}
            trend={stats.coursesCompleted > 0 ? "Keep learning!" : ""}
          />
          <StatCard
            icon={Briefcase}
            label="Jobs Completed"
            value={stats.jobsCompleted}
            subtitle={stats.jobsAvailable > 0 ? `${stats.jobsAvailable} available` : "No jobs available"}
            trend={stats.jobsCompleted > 0 ? "Great work!" : ""}
          />
          <StatCard
            icon={DollarSign}
            label="Total Earned"
            value={`$${stats.totalEarned.toFixed(0)}`}
            subtitle={stats.monthlyEarned > 0 ? `This month: $${stats.monthlyEarned.toFixed(0)}` : "Start earning"}
            trend={stats.monthlyEarned > 0 ? "Keep it up!" : ""}
          />
          <StatCard
            icon={Award}
            label="Impact Score"
            value={stats.impactScore}
            subtitle="Your points"
            trend={stats.impactScore > 0 ? "Growing!" : "Start earning points"}
          />
        </div>

        {/* Environmental Impact */}
        <Card className="p-6 mb-8 bg-gradient-card border-border shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-foreground">Your Environmental Impact</h2>
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              This Month
            </Badge>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <TreeDeciduous className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">127</p>
                <p className="text-sm text-muted-foreground">Trees Planted</p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-secondary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <Cloud className="w-6 h-6 text-secondary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">2.4t</p>
                <p className="text-sm text-muted-foreground">CO₂ Offset</p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <Droplets className="w-6 h-6 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">8,400L</p>
                <p className="text-sm text-muted-foreground">Water Saved</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Recent Activity & Quick Actions */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Recent Activity */}
          <div className="lg:col-span-2">
            <Card className="p-6 bg-card border-border shadow-sm">
              <h2 className="text-2xl font-bold text-foreground mb-6">Recent Activity</h2>
              
              <div className="space-y-4">
                {stats.recentActivities.length > 0 ? (
                  stats.recentActivities.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        activity.type === 'course' ? 'bg-primary/10' : 'bg-secondary/10'
                      }`}>
                        {activity.type === 'course' ? (
                          <BookOpen className={`w-5 h-5 ${activity.type === 'course' ? 'text-primary' : 'text-secondary'}`} />
                        ) : (
                          <Briefcase className={`w-5 h-5 ${activity.type === 'course' ? 'text-primary' : 'text-secondary'}`} />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{activity.title}</p>
                        <p className="text-sm text-muted-foreground">{activity.date}</p>
                      </div>
                    </div>
                    {activity.earned && (
                      <Badge variant="secondary" className="bg-primary/10 text-primary">
                        {activity.earned}
                      </Badge>
                    )}
                    {activity.points && (
                      <Badge variant="secondary" className="bg-accent/10 text-accent">
                        +{activity.points} pts
                      </Badge>
                    )}
                  </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No recent activity yet. Start learning or completing jobs to see your progress here!</p>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Quick Actions */}
          <div>
            <Card className="p-6 bg-card border-border shadow-sm">
              <h2 className="text-xl font-bold text-foreground mb-6">Quick Actions</h2>
              
              <div className="space-y-3">
                <Link to="/learn">
                  <Button className="w-full justify-start" variant="outline">
                    <BookOpen className="w-4 h-4 mr-2" />
                    Browse Courses
                  </Button>
                </Link>
                
                <Button
                  onClick={() => {
                    // Find first completed course and redirect to test
                    navigate("/learn");
                  }}
                  className="w-full justify-start"
                  variant="outline"
                >
                  <Trophy className="w-4 h-4 mr-2" />
                  Take Certification Test
                </Button>
                
                <Link to="/jobs">
                  <Button className="w-full justify-start" variant="outline">
                    <Briefcase className="w-4 h-4 mr-2" />
                    Find Jobs
                  </Button>
                </Link>
                
                <Link to="/profile">
                  <Button className="w-full justify-start" variant="outline">
                    <Award className="w-4 h-4 mr-2" />
                    View Achievements
                  </Button>
                </Link>
                
                <Button className="w-full justify-start bg-gradient-primary text-primary-foreground hover:opacity-90">
                  <TrendingUp className="w-4 h-4 mr-2" />
                  View Full Report
                </Button>
              </div>
            </Card>

            {/* Achievement Highlight */}
            <Card className="p-6 bg-gradient-hero border-primary/20 mt-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-4">
                  <Award className="w-8 h-8 text-primary-foreground" />
                </div>
                <h3 className="font-bold text-foreground mb-2">Next Milestone</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  5 more jobs to unlock "Climate Champion" badge
                </p>
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-gradient-primary h-2 rounded-full" style={{ width: "80%" }} />
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
