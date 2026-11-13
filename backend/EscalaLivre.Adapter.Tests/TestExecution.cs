using Xunit;

// Native solver deadlines use elapsed time. Concurrent test collections compete
// for CPU on small CI runners and can turn feasible fixtures into timeouts.
// Keep the real five-second limit and all assertions; isolate each adapter test.
[assembly: CollectionBehavior(DisableTestParallelization = true)]
